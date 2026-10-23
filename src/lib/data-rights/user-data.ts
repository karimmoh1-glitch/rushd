import "server-only";
import { db } from "@/lib/db";

// Everything a student owns, as one list. It drives "Download my data"
// (export.ts) and is checked against prisma/schema.prisma by
// user-data.test.ts, so a new table with a userId can't be forgotten.
//
// ADDING A TABLE: append one line to USER_DATA below, e.g.
//   { key: "flashcards", model: "flashcard" },
// Use `where` when ownership goes through a parent (see tutorMessages), and
// `omit` for secrets (encrypted tokens, hashes) that must never be exported.
// If a table must not be exported at all, add it to NOT_EXPORTED with a reason.

/** Prisma delegate names (db.<model>). */
export type ModelName = {
  [K in keyof typeof db]: K extends `$${string}` ? never : (typeof db)[K] extends { findMany: unknown } ? K : never;
}[keyof typeof db];

export interface UserDataSource {
  /** Name of the section in the export file. */
  key: string;
  model: ModelName;
  /** Rows owned by the user; defaults to { userId }. */
  where?: (userId: string) => Record<string, unknown>;
  /** Columns left out of the export (secrets, other people's ids). */
  omit?: string[];
}

export const USER_DATA: UserDataSource[] = [
  // The account row itself is exported separately with an explicit safe select.
  { key: "profile", model: "profile" },
  { key: "studyAvailability", model: "studyAvailability" },
  { key: "courses", model: "class" },
  { key: "assignments", model: "assignment" },
  { key: "exams", model: "exam" },
  { key: "plans", model: "plan" },
  { key: "planItems", model: "planItem" },
  { key: "studySessions", model: "studySession" },
  { key: "scheduleBlocks", model: "scheduleBlock" },
  { key: "planOverrides", model: "planOverride" },
  { key: "notifications", model: "notification" },
  { key: "feedback", model: "feedback" },
  { key: "events", model: "event" },
  { key: "courseModules", model: "courseModule" },
  { key: "courseMaterials", model: "courseMaterial" },
  { key: "tutorConversations", model: "tutorConversation" },
  { key: "tutorMessages", model: "tutorMessage", where: (userId) => ({ conversation: { userId } }) },
  { key: "tutorChecks", model: "tutorCheck" },
  { key: "draftReviews", model: "draftReview" },
  { key: "assessments", model: "assessment" },
  { key: "masteryEvidence", model: "masteryEvidence" },
  { key: "courseTopics", model: "courseTopic" },
  { key: "topicPrerequisites", model: "topicPrerequisite" },
  { key: "practiceQuestions", model: "practiceQuestion" },
  { key: "practiceSessions", model: "practiceSession" },
  { key: "questionReports", model: "questionReport" },
  // Which devices are signed in to the app, never the token hashes.
  { key: "appSignIns", model: "mobileRefreshToken", omit: ["tokenHash", "familyId", "sessionVersion", "replacedById"] },
  { key: "subscription", model: "subscription" },
  { key: "aiUsage", model: "aiUsage" },
  { key: "aiRejections", model: "aiRejection" },
  { key: "canvasConnection", model: "canvasConnection", omit: ["encryptedToken"] },
  { key: "canvasCourses", model: "canvasCourse", where: (userId) => ({ connection: { userId } }) },
  { key: "teamsConnection", model: "teamsConnection", omit: ["encryptedRefreshToken"] },
  { key: "teamsClasses", model: "teamsClass", where: (userId) => ({ connection: { userId } }) },
  { key: "calendarFeed", model: "calendarFeed", omit: ["encryptedUrl"] },
  // Invites: whether they counted, not who the other student is.
  { key: "invitesSent", model: "referral", where: (userId) => ({ referrerId: userId }), omit: ["referredId"] },
  { key: "invitedBy", model: "referral", where: (userId) => ({ referredId: userId }), omit: ["referrerId"] },
];

/** User-linked tables that are deliberately not exported. Deleted with the account all the same. */
export const NOT_EXPORTED: Record<string, string> = {
  PasswordResetToken: "Only hashes of short-lived reset links; useless to the student and secret.",
};

/** Columns of the User row that are exported (never passwordHash or sessionVersion). */
export const ACCOUNT_FIELDS = {
  id: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  onboardingCompletedAt: true,
  referralCode: true,
  isAdmin: true,
} as const;

const PAGE_SIZE = 500;

type Delegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
};

/** Reads one source's rows page by page (by id), so a large table isn't loaded at once. */
export async function* readSource(source: UserDataSource, userId: string): AsyncGenerator<Record<string, unknown>> {
  const delegate = db[source.model] as unknown as Delegate;
  const where = source.where ? source.where(userId) : { userId };
  const omit = source.omit ? Object.fromEntries(source.omit.map((field) => [field, true])) : undefined;
  let cursor: string | undefined;
  for (;;) {
    const rows = await delegate.findMany({
      where,
      ...(omit ? { omit } : {}),
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) yield row;
    if (rows.length < PAGE_SIZE) return;
    cursor = String(rows[rows.length - 1].id);
  }
}
