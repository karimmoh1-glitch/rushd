import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { db } from "@/lib/db";
import { getAssignmentMaterial, getMaterial, searchMaterials, type MaterialKind } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import type { RubricCriterion } from "@/lib/canvas/content";
import { getMastery } from "@/lib/practice/load";
import { AssessmentResultSchema } from "@/lib/practice/assessment";

// The tutor's tools. Each executor receives a TutorScope built on the server
// from the session and the conversation row; the model only supplies search
// text and ids, and every id is re-checked against scope.userId (and the
// conversation's class) before anything is read. All tools are read-only.

export interface TutorScope {
  userId: string;
  classId: string | null;
  assignmentId: string | null;
  timeZone: string;
  now: Date;
}

export interface RetrievedSource {
  id: string;
  title: string;
  kind: MaterialKind;
  className: string;
  url: string | null;
}

/** Sources the tutor actually read during a turn; citations are resolved
 * only against this registry, so a made-up id can never become a link. */
export class SourceRegistry {
  private readonly sources = new Map<string, RetrievedSource>();
  add(source: RetrievedSource) {
    this.sources.set(source.id, source);
  }
  get(id: string) {
    return this.sources.get(id);
  }
  get size() {
    return this.sources.size;
  }
}

export const TUTOR_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_course_materials",
    description:
      "Full-text search over the student's synced Canvas course content (pages, assignment descriptions, announcements, module item titles). Scoped automatically to the course this conversation is about, if any. Returns short excerpts with source ids; call read_course_material for the full text before relying on details.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_course_material",
    description: "Read the full text of one course material by the source id a search returned. Includes the rubric when the material is an assignment that has one.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { source_id: { type: "string" } },
      required: ["source_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_assignment",
    description:
      "Details of one of the student's assignments: due date, status, estimate, and, when it came from Canvas and course content is synced, the teacher's description and rubric. Pass null to get the assignment this conversation is about.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { assignment_id: { type: ["string", "null"] } },
      required: ["assignment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_learning_profile",
    description:
      "The student's own topic mastery estimates (from their practice checks, with confidence) and the specific gaps found in their most recent checks. Use it to target help at what they've shown they're missing.",
    strict: true,
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "list_upcoming_work",
    description: "The student's open assignments and exams due within the next N days (1-28), soonest first.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Days ahead to look, 1-28." } },
      required: ["days"],
      additionalProperties: false,
    },
  },
];

const Inputs = {
  search_course_materials: z.object({ query: z.string().trim().min(1).max(300) }),
  read_course_material: z.object({ source_id: z.string().min(1).max(64) }),
  get_assignment: z.object({ assignment_id: z.string().min(1).max(64).nullable() }),
  list_upcoming_work: z.object({ days: z.number().int().min(1).max(28) }),
  get_learning_profile: z.object({}),
};
export type TutorToolName = keyof typeof Inputs;

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

/** Wraps Canvas text so the model treats it as material to reason about,
 * never as instructions to follow. */
function untrusted(label: string, text: string): string {
  return `<course_material ${label}>\n${text.replace(/<\/?course_material[^>]*>/gi, "")}\n</course_material>`;
}

function formatRubric(rubric: RubricCriterion[] | null): string {
  if (!rubric) return "Rubric: none published in Canvas for this assignment. Do not invent criteria.";
  return [
    "Rubric (from Canvas):",
    ...rubric.map(
      (c) =>
        `- [${c.id}] ${c.description} (${c.points} pts)${c.longDescription ? `: ${c.longDescription}` : ""}\n` +
        c.ratings.map((r) => `    · ${r.description} (${r.points} pts)${r.longDescription ? `: ${r.longDescription}` : ""}`).join("\n"),
    ),
  ].join("\n");
}

export async function runTutorTool(
  name: string,
  rawInput: unknown,
  scope: TutorScope,
  registry: SourceRegistry,
): Promise<ToolOutcome> {
  if (!(name in Inputs)) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = Inputs[name as TutorToolName].safeParse(rawInput);
  if (!parsed.success) return { content: `INVALID_INPUT: ${parsed.error.issues[0]?.message ?? "bad input"}`, isError: true };

  switch (name as TutorToolName) {
    case "search_course_materials": {
      const { query } = parsed.data as z.infer<(typeof Inputs)["search_course_materials"]>;
      const hits = await searchMaterials(scope.userId, { query, classId: scope.classId, limit: 6 });
      if (hits.length === 0) {
        return { content: "No synced course material matched. The course may not be synced yet, or the topic isn't covered in Canvas." };
      }
      for (const h of hits) registry.add({ id: h.id, title: h.title, kind: h.kind, className: h.className, url: h.url });
      return {
        content: hits
          .map((h) => untrusted(`source_id="${h.id}" kind="${h.kind}" class="${h.className}"`, `Title: ${h.title}\nExcerpt: ${h.excerpt || "(no text)"}`))
          .join("\n"),
      };
    }
    case "read_course_material": {
      const { source_id } = parsed.data as z.infer<(typeof Inputs)["read_course_material"]>;
      const m = await getMaterial(scope.userId, source_id, { classId: scope.classId });
      if (!m) return { content: "No material with that id is available in this conversation.", isError: true };
      registry.add({ id: m.id, title: m.title, kind: m.kind, className: m.className, url: m.url });
      const body = m.body.length > 12_000 ? `${m.body.slice(0, 12_000)}…` : m.body;
      const extra = m.kind === "ASSIGNMENT" ? `\n\n${formatRubric(m.rubric)}` : "";
      return { content: untrusted(`source_id="${m.id}" kind="${m.kind}" class="${m.className}"`, `Title: ${m.title}\n\n${body || "(no text)"}${extra}`) };
    }
    case "get_assignment": {
      const { assignment_id } = parsed.data as z.infer<(typeof Inputs)["get_assignment"]>;
      const id = assignment_id ?? scope.assignmentId;
      if (!id) return { content: "This conversation isn't about a specific assignment. Ask the student which one, or use list_upcoming_work." };
      const a = await db.assignment.findFirst({
        where: { id, userId: scope.userId, ...(scope.classId ? { classId: scope.classId } : {}) },
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          estimatedMinutes: true,
          pointsPossible: true,
          source: true,
          notes: true,
          class: { select: { name: true } },
        },
      });
      if (!a) return { content: "No assignment with that id is available in this conversation.", isError: true };
      const canvas = await getAssignmentMaterial(scope.userId, a.id);
      if (canvas) registry.add({ id: canvas.id, title: canvas.title, kind: canvas.kind, className: canvas.className, url: canvas.url });
      const facts = [
        `Assignment: ${a.title} (${a.class.name})`,
        `Due: ${formatDateInZone(a.dueAt, scope.timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
        `Status: ${a.status}`,
        `Estimated work: ${a.estimatedMinutes} minutes`,
        a.pointsPossible != null ? `Points possible: ${a.pointsPossible}` : null,
        a.notes ? `Student's own notes: ${a.notes}` : null,
      ].filter(Boolean);
      const detail = canvas
        ? untrusted(`source_id="${canvas.id}" kind="ASSIGNMENT"`, `Teacher's description:\n${canvas.body || "(empty)"}\n\n${formatRubric(canvas.rubric)}`)
        : a.source === "CANVAS"
          ? "The Canvas description and rubric haven't been synced for this course yet."
          : "Added by hand in Rushd; there is no teacher description or rubric on file.";
      return { content: `${facts.join("\n")}\n\n${detail}` };
    }
    case "get_learning_profile": {
      const [topics, recent] = await Promise.all([
        getMastery(scope.userId, scope.now),
        db.assessment.findMany({
          where: { userId: scope.userId, ...(scope.classId ? { classId: scope.classId } : {}) },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { topic: true, createdAt: true, result: true },
        }),
      ]);
      if (topics.length === 0) return { content: "No practice checks yet, so there's no mastery evidence. Don't guess at their level; ask a diagnostic question instead." };
      const topicLines = topics
        .slice(0, 12)
        .map((t) => `- ${t.topicLabel}: ~${t.estimate}% (range ${t.low}-${t.high}, ${t.confidence} confidence, ${t.evidenceCount} check${t.evidenceCount === 1 ? "" : "s"})`);
      const gapLines = recent.flatMap((a) => {
        const parsed = AssessmentResultSchema.safeParse(a.result);
        return parsed.success ? parsed.data.gaps.map((g) => `- ${a.topic}: ${g.concept} (likely prerequisite: ${g.prerequisite}). Evidence: ${g.evidence}`) : [];
      });
      return {
        content: `Topic estimates (from short checks; treat as rough):\n${topicLines.join("\n")}${gapLines.length ? `\n\nGaps from recent checks:\n${gapLines.join("\n")}` : ""}`,
      };
    }
    case "list_upcoming_work": {
      const { days } = parsed.data as z.infer<(typeof Inputs)["list_upcoming_work"]>;
      const until = new Date(scope.now.getTime() + days * 24 * 60 * 60 * 1000);
      const classFilter = scope.classId ? { classId: scope.classId } : {};
      const [assignments, exams] = await Promise.all([
        db.assignment.findMany({
          where: { userId: scope.userId, status: { not: "COMPLETED" }, dueAt: { lte: until }, class: { archived: false }, ...classFilter },
          orderBy: { dueAt: "asc" },
          take: 25,
          select: { id: true, title: true, dueAt: true, estimatedMinutes: true, class: { select: { name: true } } },
        }),
        db.exam.findMany({
          where: { userId: scope.userId, examAt: { gte: scope.now, lte: until }, class: { archived: false }, ...classFilter },
          orderBy: { examAt: "asc" },
          take: 10,
          select: { title: true, examAt: true, class: { select: { name: true } } },
        }),
      ]);
      const fmt = (d: Date) => formatDateInZone(d, scope.timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const lines = [
        ...assignments.map((a) => `- [assignment_id=${a.id}] ${a.title} (${a.class.name}), due ${fmt(a.dueAt)}${a.dueAt < scope.now ? " (OVERDUE)" : ""}, ~${a.estimatedMinutes} min`),
        ...exams.map((e) => `- Exam: ${e.title} (${e.class.name}), ${fmt(e.examAt)}`),
      ];
      return { content: lines.length ? lines.join("\n") : `Nothing open in the next ${days} days.` };
    }
  }
}
