import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { db } from "@/lib/db";
import { getAssignmentMaterial, getMaterial, searchMaterials, type MaterialKind } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import type { RubricCriterion } from "@/lib/canvas/content";
import { getMastery } from "@/lib/practice/load";
import { AssessmentResultSchema } from "@/lib/practice/assessment";

// The tutor's read-only tools. TutorScope comes from the server session, never
// the model: every id the model sends is re-checked against scope.userId (and
// the conversation's class) before anything is read.

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

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/** Wraps Canvas text so the model treats it as material to reason about,
 * never as instructions to follow. */
function untrusted(label: string, text: string): string {
  // Strip any tags in the text that could fake the end of the block.
  const safeText = text.replace(/<\/?course_material[^>]*>/gi, "");
  return `<course_material ${label}>\n${safeText}\n</course_material>`;
}

function formatRubric(rubric: RubricCriterion[] | null): string {
  if (!rubric) return "Rubric: none published in Canvas for this assignment. Do not invent criteria.";
  const lines = ["Rubric (from Canvas):"];
  for (const criterion of rubric) {
    let header = `- [${criterion.id}] ${criterion.description} (${criterion.points} pts)`;
    if (criterion.longDescription) header += `: ${criterion.longDescription}`;

    const ratingLines: string[] = [];
    for (const rating of criterion.ratings) {
      let line = `    · ${rating.description} (${rating.points} pts)`;
      if (rating.longDescription) line += `: ${rating.longDescription}`;
      ratingLines.push(line);
    }
    lines.push(`${header}\n${ratingLines.join("\n")}`);
  }
  return lines.join("\n");
}

/** Remembers a material the tutor read, so its citation can become a link. */
function remember(registry: SourceRegistry, material: RetrievedSource) {
  registry.add({ id: material.id, title: material.title, kind: material.kind, className: material.className, url: material.url });
}

function invalidInput(error: z.ZodError): ToolOutcome {
  return { content: `INVALID_INPUT: ${error.issues[0]?.message ?? "bad input"}`, isError: true };
}

async function searchCourseMaterials(query: string, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const hits = await searchMaterials(scope.userId, { query, classId: scope.classId, limit: 6 });
  if (hits.length === 0) {
    return { content: "No synced course material matched. The course may not be synced yet, or the topic isn't covered in Canvas." };
  }
  const blocks: string[] = [];
  for (const hit of hits) {
    remember(registry, hit);
    const label = `source_id="${hit.id}" kind="${hit.kind}" class="${hit.className}"`;
    blocks.push(untrusted(label, `Title: ${hit.title}\nExcerpt: ${hit.excerpt || "(no text)"}`));
  }
  return { content: blocks.join("\n") };
}

async function readCourseMaterial(sourceId: string, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const material = await getMaterial(scope.userId, sourceId, { classId: scope.classId });
  if (!material) return { content: "No material with that id is available in this conversation.", isError: true };
  remember(registry, material);

  let body = material.body;
  if (body.length > 12_000) body = `${body.slice(0, 12_000)}…`;
  let rubricPart = "";
  if (material.kind === "ASSIGNMENT") rubricPart = `\n\n${formatRubric(material.rubric)}`;

  const label = `source_id="${material.id}" kind="${material.kind}" class="${material.className}"`;
  return { content: untrusted(label, `Title: ${material.title}\n\n${body || "(no text)"}${rubricPart}`) };
}

async function getAssignment(assignmentId: string | null, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const id = assignmentId ?? scope.assignmentId;
  if (!id) return { content: "This conversation isn't about a specific assignment. Ask the student which one, or use list_upcoming_work." };

  const classFilter = scope.classId ? { classId: scope.classId } : {};
  const assignment = await db.assignment.findFirst({
    where: { id, userId: scope.userId, ...classFilter },
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
  if (!assignment) return { content: "No assignment with that id is available in this conversation.", isError: true };

  const canvas = await getAssignmentMaterial(scope.userId, assignment.id);
  if (canvas) remember(registry, canvas);

  const facts = [
    `Assignment: ${assignment.title} (${assignment.class.name})`,
    `Due: ${formatDateInZone(assignment.dueAt, scope.timeZone, DATE_FORMAT)}`,
    `Status: ${assignment.status}`,
    `Estimated work: ${assignment.estimatedMinutes} minutes`,
  ];
  if (assignment.pointsPossible != null) facts.push(`Points possible: ${assignment.pointsPossible}`);
  if (assignment.notes) facts.push(`Student's own notes: ${assignment.notes}`);

  let detail: string;
  if (canvas) {
    detail = untrusted(
      `source_id="${canvas.id}" kind="ASSIGNMENT"`,
      `Teacher's description:\n${canvas.body || "(empty)"}\n\n${formatRubric(canvas.rubric)}`,
    );
  } else if (assignment.source === "CANVAS") {
    detail = "The Canvas description and rubric haven't been synced for this course yet.";
  } else {
    detail = "Added by hand in Rushd; there is no teacher description or rubric on file.";
  }
  return { content: `${facts.join("\n")}\n\n${detail}` };
}

async function getLearningProfile(scope: TutorScope): Promise<ToolOutcome> {
  const classFilter = scope.classId ? { classId: scope.classId } : {};
  const [topics, recent] = await Promise.all([
    getMastery(scope.userId, scope.now),
    db.assessment.findMany({
      where: { userId: scope.userId, ...classFilter },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { topic: true, createdAt: true, result: true },
    }),
  ]);
  if (topics.length === 0) {
    return { content: "No practice checks yet, so there's no mastery evidence. Don't guess at their level; ask a diagnostic question instead." };
  }

  const topicLines: string[] = [];
  for (const t of topics.slice(0, 12)) {
    const checks = t.evidenceCount === 1 ? "check" : "checks";
    topicLines.push(`- ${t.topicLabel}: ~${t.estimate}% (range ${t.low}-${t.high}, ${t.confidence} confidence, ${t.evidenceCount} ${checks})`);
  }

  const gapLines: string[] = [];
  for (const assessment of recent) {
    const parsed = AssessmentResultSchema.safeParse(assessment.result);
    if (!parsed.success) continue;
    for (const gap of parsed.data.gaps) {
      gapLines.push(`- ${assessment.topic}: ${gap.concept} (likely prerequisite: ${gap.prerequisite}). Evidence: ${gap.evidence}`);
    }
  }

  let content = `Topic estimates (from short checks; treat as rough):\n${topicLines.join("\n")}`;
  if (gapLines.length > 0) content += `\n\nGaps from recent checks:\n${gapLines.join("\n")}`;
  return { content };
}

async function listUpcomingWork(days: number, scope: TutorScope): Promise<ToolOutcome> {
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

  const lines: string[] = [];
  for (const a of assignments) {
    const overdue = a.dueAt < scope.now ? " (OVERDUE)" : "";
    const due = formatDateInZone(a.dueAt, scope.timeZone, DATE_FORMAT);
    lines.push(`- [assignment_id=${a.id}] ${a.title} (${a.class.name}), due ${due}${overdue}, ~${a.estimatedMinutes} min`);
  }
  for (const e of exams) {
    lines.push(`- Exam: ${e.title} (${e.class.name}), ${formatDateInZone(e.examAt, scope.timeZone, DATE_FORMAT)}`);
  }
  if (lines.length === 0) return { content: `Nothing open in the next ${days} days.` };
  return { content: lines.join("\n") };
}

/** Validates the model's input for a tool, then runs it. */
export async function runTutorTool(
  name: string,
  rawInput: unknown,
  scope: TutorScope,
  registry: SourceRegistry,
): Promise<ToolOutcome> {
  switch (name) {
    case "search_course_materials": {
      const parsed = Inputs.search_course_materials.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return searchCourseMaterials(parsed.data.query, scope, registry);
    }
    case "read_course_material": {
      const parsed = Inputs.read_course_material.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return readCourseMaterial(parsed.data.source_id, scope, registry);
    }
    case "get_assignment": {
      const parsed = Inputs.get_assignment.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return getAssignment(parsed.data.assignment_id, scope, registry);
    }
    case "get_learning_profile": {
      const parsed = Inputs.get_learning_profile.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return getLearningProfile(scope);
    }
    case "list_upcoming_work": {
      const parsed = Inputs.list_upcoming_work.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return listUpcomingWork(parsed.data.days, scope);
    }
    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
