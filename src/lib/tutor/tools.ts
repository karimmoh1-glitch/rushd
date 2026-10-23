import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { db } from "@/lib/db";
import { getAssignmentMaterial, getMaterial, searchMaterials, type MaterialKind } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import type { RubricCriterion } from "@/lib/canvas/content";
import { getMastery } from "@/lib/practice/load";
import { AssessmentResultSchema } from "@/lib/practice/assessment";
import { logEvent } from "@/lib/analytics/log-event";
import { getCourseLearning } from "@/lib/learning/load";
import { STATUS_LABEL } from "@/lib/learning/estimator";
import { formatDateKey, formatMinuteOfDay } from "@/lib/time/zone";
import { poseCheck, takeHint, gradeCheck } from "./checks";
import { planRevision } from "./offers";
import type { TutorCard } from "./cards";

// The tutor's read-only tools. TutorScope comes from the server session, never
// the model: every id the model sends is re-checked against scope.userId (and
// the conversation's class) before anything is read.

export interface TutorScope {
  userId: string;
  classId: string | null;
  assignmentId: string | null;
  timeZone: string;
  /** When this turn started (the student's message was sent). */
  now: Date;
  /** The conversation this turn belongs to; course tools need it. */
  conversationId?: string | null;
  /** This turn's message from the student, as received by the server. The
   * only text that can be graded as an answer. */
  studentMessage?: string;
}

export interface RetrievedSource {
  id: string;
  /** For the in-app link to the material; absent on older stored sources. */
  classId?: string | null;
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
  /** Cards built by tools this turn, attached to the reply. */
  readonly cards: TutorCard[] = [];
  /** At most one graded answer per student message. */
  graded = false;
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

/** Tools that act inside one course; offered only when the conversation has one. */
export const COURSE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "recommend_prerequisite",
    description:
      "For a topic the student is struggling with, Rushd's prerequisite remediation: which earlier topic to shore up first and why, from the student's own topic map and practice results.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { topic_id: { type: "string" } },
      required: ["topic_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_check_question",
    description:
      "Ask the student one question from their own practice bank for this course (by topic_id, or a specific question_id). Returns the question and its reference answer for you to grade against later. Show the student only the question; never reveal the answer before they try. Their answer, in their next message, can be graded with grade_check_answer and then counts as evidence of mastery. Questions you write yourself are fine for teaching but are never graded or recorded.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { topic_id: { type: ["string", "null"] }, question_id: { type: ["string", "null"] } },
      required: ["topic_id", "question_id"],
      additionalProperties: false,
    },
  },
  {
    name: "give_hint",
    description: "The next stored hint for the open check question, when the student asks for help with it. Hints lower the credit the answer earns, so give one at a time.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { check_id: { type: "string" } },
      required: ["check_id"],
      additionalProperties: false,
    },
  },
  {
    name: "grade_check_answer",
    description:
      "Grade the student's answer to an open check question (asked in an earlier reply) against its reference answer, and record it. The answer graded is the student's current message exactly as they sent it. Use only when that message is a real attempt at the question. correct = right with sound reasoning; partial = right idea with an error or gap; incorrect = wrong or 'I don't know'.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { check_id: { type: "string" }, result: { type: "string", enum: ["correct", "partial", "incorrect"] } },
      required: ["check_id", "result"],
      additionalProperties: false,
    },
  },
  {
    name: "create_revision_plan",
    description:
      "Build a revision plan for this course's next exam (or the exam_id given) from the student's topics, mastery and the days left, with suggested study sessions. The student sees it as a card and decides whether to add the sessions to their plan; nothing is scheduled until they confirm.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { exam_id: { type: ["string", "null"] } },
      required: ["exam_id"],
      additionalProperties: false,
    },
  },
  {
    name: "offer_practice_generation",
    description:
      "Offer the student a button to generate targeted practice questions (1-5) for one topic into their course's practice bank. They are labeled AI-generated and unverified. Nothing is generated until the student presses the button.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { topic_id: { type: "string" }, count: { type: "integer", description: "1-5" } },
      required: ["topic_id", "count"],
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
  recommend_prerequisite: z.object({ topic_id: z.string().min(1).max(64) }),
  ask_check_question: z.object({ topic_id: z.string().min(1).max(64).nullable(), question_id: z.string().min(1).max(64).nullable() }),
  give_hint: z.object({ check_id: z.string().min(1).max(64) }),
  grade_check_answer: z.object({ check_id: z.string().min(1).max(64), result: z.enum(["correct", "partial", "incorrect"]) }),
  create_revision_plan: z.object({ exam_id: z.string().min(1).max(64).nullable() }),
  offer_practice_generation: z.object({ topic_id: z.string().min(1).max(64), count: z.number().int().min(1).max(5) }),
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
  registry.add({ id: material.id, classId: material.classId ?? null, title: material.title, kind: material.kind, className: material.className, url: material.url });
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
  if (scope.classId) {
    const learning = await getCourseLearning(scope.userId, scope.classId, scope.now);
    if (learning && learning.topics.length > 0) {
      const lines = learning.topics.slice(0, 30).map((t) => {
        const e = t.estimate;
        const pct = e.estimate === null ? "" : ` ~${e.estimate}%`;
        return `- [topic_id=${t.id}] ${t.title}: ${STATUS_LABEL[e.status]}${pct}, ${e.confidence} confidence. ${e.explanation}`;
      });
      const review = learning.review.slice(0, 5).map((r) => `- ${r.title}: ${r.reason}`);
      let content = `Topic mastery in this course (rough estimates from self-marked practice):\n${lines.join("\n")}`;
      if (review.length) content += `\n\nDue for review now:\n${review.join("\n")}`;
      return { content };
    }
  }
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

function courseScope(scope: TutorScope): { classId: string; conversationId: string } | null {
  if (!scope.classId || !scope.conversationId) return null;
  return { classId: scope.classId, conversationId: scope.conversationId };
}

const NO_COURSE: ToolOutcome = { content: "This conversation isn't about one course. Ask the student to pick a course for this.", isError: true };

async function recommendPrerequisite(topicId: string, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  const learning = await getCourseLearning(scope.userId, course.classId, scope.now);
  const topic = learning?.topics.find((t) => t.id === topicId);
  if (!topic) return { content: "No confirmed topic with that id in this course.", isError: true };
  const status = STATUS_LABEL[topic.estimate.status];
  if (!topic.remediation) {
    const why = topic.prerequisiteIds.length === 0
      ? "It has no prerequisites in the student's topic map, so Rushd can't point to an earlier topic. Say so; you may suggest likely prerequisites from general knowledge, labeled as general knowledge."
      : "It isn't struggling enough for remediation (it isn't under review or under 70%).";
    return { content: `${topic.title}: ${status}. ${why}` };
  }
  const remediation = topic.remediation;
  registry.cards.push({
    type: "prerequisite",
    classId: course.classId,
    topicTitle: topic.title,
    prerequisiteTitle: remediation.kind === "prerequisite" ? remediation.title : null,
    reason: remediation.reason,
  });
  return { content: `${topic.title}: ${status}. Rushd's recommendation: ${remediation.reason} (The student sees this as a card.)` };
}

async function askCheckQuestion(input: z.infer<typeof Inputs.ask_check_question>, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  if (registry.cards.some((c) => c.type === "check")) return { content: "You already asked a check question in this reply. Wait for the answer.", isError: true };
  const posed = await poseCheck(scope.userId, { conversationId: course.conversationId, classId: course.classId, topicId: input.topic_id, questionId: input.question_id, now: scope.now });
  if (!posed.ok) {
    if (posed.error === "NO_BANK_QUESTIONS") {
      return { content: "That topic has no questions in the student's practice bank yet. Offer to generate some (offer_practice_generation), or ask your own question as ungraded practice and say it won't be recorded." };
    }
    return { content: posed.error, isError: true };
  }
  const c = posed.check;
  registry.cards.push({
    type: "check",
    checkId: c.checkId,
    classId: course.classId,
    topicTitle: c.topicTitle,
    prompt: c.prompt,
    origin: c.origin,
    sourceNote: c.sourceNote,
    hintsAvailable: c.hintsAvailable,
  });
  const origin = c.origin === "AI_GENERATED" ? "AI-generated, unverified: if the reference answer looks wrong, say so rather than grading against it" : "written by the student";
  return {
    content: [
      `check_id=${c.checkId}. The student sees this question as a card; introduce it in a sentence and don't repeat the answer.`,
      `Question origin: ${origin}. Topic: ${c.topicTitle ?? "none"}. Difficulty ${c.difficulty}/3. Stored hints: ${c.hintsAvailable}.`,
      untrusted(`kind="PRACTICE_QUESTION" check_id="${c.checkId}"`, `Question: ${c.prompt}\n\nReference answer (do not reveal before they try): ${c.answer}${c.explanation ? `\n\nExplanation: ${c.explanation}` : ""}`),
    ].join("\n"),
  };
}

async function giveHint(checkId: string, scope: TutorScope): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  const hint = await takeHint(scope.userId, checkId, { conversationId: course.conversationId, via: "tutor" });
  if (!hint.ok) return { content: hint.error, isError: true };
  if (!hint.hint) return { content: `Hint ${hint.n} counted. No stored hint is left: give a small nudge of your own, not the answer.` };
  return { content: `Hint ${hint.n} (${hint.remaining} more stored):\n${untrusted('kind="HINT"', hint.hint)}` };
}

const RESULT_VALUE = { correct: "CORRECT", partial: "PARTIAL", incorrect: "INCORRECT" } as const;

async function gradeCheckAnswer(input: z.infer<typeof Inputs.grade_check_answer>, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  if (registry.graded) return { content: "One answer per message: this message was already graded.", isError: true };
  const graded = await gradeCheck(scope.userId, input.check_id, {
    conversationId: course.conversationId,
    result: RESULT_VALUE[input.result],
    studentAnswer: scope.studentMessage ?? "",
    turnStartedAt: scope.now,
    now: scope.now,
  });
  if (!graded.ok) return { content: graded.error, isError: true };
  registry.graded = true;
  registry.cards.push({
    type: "graded",
    checkId: input.check_id,
    classId: graded.classId,
    topicTitle: graded.topicTitle,
    result: RESULT_VALUE[input.result],
    hintsUsed: graded.hintsUsed,
    before: graded.before,
    after: graded.after,
  });
  const change = graded.before && graded.after && graded.before !== graded.after ? ` The topic moved from ${STATUS_LABEL[graded.before]} to ${STATUS_LABEL[graded.after]}.` : "";
  return {
    content: `Recorded as ${input.result} with ${graded.hintsUsed} hint(s).${change} Now compare their reasoning with the reference solution step by step, name the specific misconception if there is one, and say what to do next.`,
  };
}

async function createRevisionPlan(examId: string | null, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  if (registry.cards.some((c) => c.type === "revision_plan")) return { content: "A plan is already attached to this reply.", isError: true };
  const plan = await planRevision(scope.userId, { classId: course.classId, examId, now: scope.now, timeZone: scope.timeZone });
  if ("error" in plan) {
    if (plan.error === "NO_EXAM") {
      return { content: "No upcoming exam is on file for this course. Tell the student they can add it from the course's page (Exams), then ask again; don't invent a date." };
    }
    return { content: plan.error, isError: true };
  }
  registry.cards.push({ type: "revision_plan", classId: course.classId, ...plan, accepted: null });
  await logEvent(scope.userId, "tutor_revision_plan_created", { sessions: plan.sessions.length, daysLeft: plan.daysLeft, topics: plan.priorities.length });
  const sessions = plan.sessions.map(
    (s) => `- ${formatDateKey(s.date, { weekday: "short", month: "short", day: "numeric" })} ${formatMinuteOfDay(s.startMinute)}, ${s.minutes} min: ${s.topics.join(", ")}${s.kind === "mixed" ? " (mixed review)" : ""}`,
  );
  const priorities = plan.priorities.map((p) => `${p.title} (${STATUS_LABEL[p.status]})`).join("; ");
  return {
    content: [
      `Revision plan for "${plan.examTitle}" in ${plan.daysLeft} day(s). The student sees it as a card with a button to add the sessions to their plan; nothing is scheduled until they press it.`,
      `Priorities, weakest first: ${priorities || "no confirmed topics"}.`,
      sessions.length ? `Sessions:\n${sessions.join("\n")}` : "No sessions could be scheduled.",
      `Notes: ${plan.notes.join(" ")}`,
      "Explain briefly why the order makes sense (weakest topics first and again later), and what each session should include (retrieval practice before re-reading).",
    ].join("\n"),
  };
}

async function offerPracticeGeneration(input: z.infer<typeof Inputs.offer_practice_generation>, scope: TutorScope, registry: SourceRegistry): Promise<ToolOutcome> {
  const course = courseScope(scope);
  if (!course) return NO_COURSE;
  const topic = await db.courseTopic.findFirst({ where: { id: input.topic_id, userId: scope.userId, classId: course.classId, status: "CONFIRMED" }, select: { id: true, title: true } });
  if (!topic) return { content: "No confirmed topic with that id in this course.", isError: true };
  if (registry.cards.some((c) => c.type === "practice_offer")) return { content: "An offer is already attached to this reply.", isError: true };
  registry.cards.push({ type: "practice_offer", classId: course.classId, topicId: topic.id, topicTitle: topic.title, count: input.count, generated: null });
  return { content: `The student now sees a button to generate ${input.count} question(s) on ${topic.title}. They'll be labeled AI-generated and unverified. Mention it in one sentence.` };
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
    case "recommend_prerequisite": {
      const parsed = Inputs.recommend_prerequisite.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return recommendPrerequisite(parsed.data.topic_id, scope, registry);
    }
    case "ask_check_question": {
      const parsed = Inputs.ask_check_question.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return askCheckQuestion(parsed.data, scope, registry);
    }
    case "give_hint": {
      const parsed = Inputs.give_hint.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return giveHint(parsed.data.check_id, scope);
    }
    case "grade_check_answer": {
      const parsed = Inputs.grade_check_answer.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return gradeCheckAnswer(parsed.data, scope, registry);
    }
    case "create_revision_plan": {
      const parsed = Inputs.create_revision_plan.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return createRevisionPlan(parsed.data.exam_id, scope, registry);
    }
    case "offer_practice_generation": {
      const parsed = Inputs.offer_practice_generation.safeParse(rawInput);
      if (!parsed.success) return invalidInput(parsed.error);
      return offerPracticeGeneration(parsed.data, scope, registry);
    }
    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
