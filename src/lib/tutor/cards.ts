import * as z from "zod";

// Structured cards attached to a tutor reply. Server code builds them from
// the student's own rows (never from model-written JSON), stores them on the
// TutorMessage, and the page renders them. Reading goes through the schema,
// so a malformed stored value just shows no card.

const Status = z.enum(["secure", "developing", "needs_review", "not_enough_evidence"]);

export const CheckCardSchema = z.object({
  type: z.literal("check"),
  checkId: z.string(),
  classId: z.string(),
  topicTitle: z.string().nullable(),
  prompt: z.string(),
  origin: z.enum(["STUDENT", "AI_GENERATED"]),
  sourceNote: z.string().nullable(),
  hintsAvailable: z.number().int(),
});

export const GradedCardSchema = z.object({
  type: z.literal("graded"),
  checkId: z.string(),
  classId: z.string(),
  topicTitle: z.string().nullable(),
  result: z.enum(["CORRECT", "PARTIAL", "INCORRECT"]),
  hintsUsed: z.number().int(),
  before: Status.nullable(),
  after: Status.nullable(),
});

export const PrerequisiteCardSchema = z.object({
  type: z.literal("prerequisite"),
  classId: z.string(),
  topicTitle: z.string(),
  prerequisiteTitle: z.string().nullable(),
  reason: z.string(),
});

export const RevisionPlanCardSchema = z.object({
  type: z.literal("revision_plan"),
  classId: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  examDate: z.string(),
  daysLeft: z.number().int(),
  sessions: z.array(
    z.object({ date: z.string(), startMinute: z.number().int(), minutes: z.number().int(), topics: z.array(z.string()), kind: z.enum(["focus", "mixed"]) }),
  ),
  notes: z.array(z.string()),
  accepted: z.object({ added: z.number().int(), skipped: z.number().int() }).nullable(),
});

export const PracticeOfferCardSchema = z.object({
  type: z.literal("practice_offer"),
  classId: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  count: z.number().int(),
  generated: z.number().int().nullable(),
});

export const TutorCardSchema = z.discriminatedUnion("type", [
  CheckCardSchema,
  GradedCardSchema,
  PrerequisiteCardSchema,
  RevisionPlanCardSchema,
  PracticeOfferCardSchema,
]);

export type TutorCard = z.infer<typeof TutorCardSchema>;
export type CheckCard = z.infer<typeof CheckCardSchema>;
export type GradedCard = z.infer<typeof GradedCardSchema>;
export type RevisionPlanCard = z.infer<typeof RevisionPlanCardSchema>;
export type PracticeOfferCard = z.infer<typeof PracticeOfferCardSchema>;

/** Stored JSON -> cards; anything that doesn't parse is dropped. */
export function readCards(value: unknown): TutorCard[] {
  if (!Array.isArray(value)) return [];
  const cards: TutorCard[] = [];
  for (const item of value.slice(0, 10)) {
    const parsed = TutorCardSchema.safeParse(item);
    if (parsed.success) cards.push(parsed.data);
  }
  return cards;
}
