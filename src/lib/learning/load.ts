import "server-only";
import { db } from "@/lib/db";
import { estimateTopic, type TopicEstimate } from "./estimator";
import { recommendRemediation, type Edge, type Remediation } from "./graph";
import { toObservation, type EvidenceRowV2 } from "./observations";
import { reviewQueue, type ReviewItem } from "./review";

// Reads a student's topics and evidence and runs the pure estimator over them.
// Everything is scoped to the userId passed in.

export interface TopicView {
  id: string;
  classId: string;
  title: string;
  parentId: string | null;
  position: number;
  source: "STUDENT" | "SYLLABUS" | "TEMPLATE" | "AI_SUGGESTED";
  status: "CONFIRMED" | "PROPOSED";
  estimate: TopicEstimate;
  prerequisiteIds: string[];
  remediation: Remediation | null;
}

export interface CourseLearning {
  /** Confirmed topics, parents before their subtopics, in the student's order. */
  topics: TopicView[];
  proposed: TopicView[];
  edges: Edge[];
  review: ReviewItem[];
}

const EVIDENCE_SELECT = {
  id: true,
  createdAt: true,
  score: true,
  weight: true,
  assessmentId: true,
  sessionId: true,
  questionId: true,
  result: true,
  difficulty: true,
  hintsUsed: true,
  confidence: true,
  topicId: true,
  topicKey: true,
  topicLabel: true,
  classId: true,
} as const;

type EvidenceWithTopic = EvidenceRowV2 & { topicId: string | null; topicKey: string; topicLabel: string; classId: string | null };

/** Parents first, then each parent's subtopics, by position. */
function treeOrder<T extends { id: string; parentId: string | null; position: number }>(topics: T[]): T[] {
  const byPosition = (a: T, b: T) => a.position - b.position;
  const ids = new Set(topics.map((t) => t.id));
  const roots = topics.filter((t) => !t.parentId || !ids.has(t.parentId)).sort(byPosition);
  const ordered: T[] = [];
  for (const root of roots) {
    ordered.push(root);
    ordered.push(...topics.filter((t) => t.parentId === root.id).sort(byPosition));
  }
  return ordered;
}

function buildCourse(
  topics: { id: string; classId: string; title: string; key: string; parentId: string | null; position: number; source: TopicView["source"]; status: TopicView["status"] }[],
  edges: Edge[],
  evidence: EvidenceWithTopic[],
  now: Date,
): CourseLearning {
  const confirmed = topics.filter((t) => t.status === "CONFIRMED");
  const idByKey = new Map(confirmed.map((t) => [`${t.classId}:${t.key}`, t.id]));
  const byTopic = new Map<string, EvidenceRowV2[]>();
  for (const row of evidence) {
    const topicId = row.topicId ?? (row.classId ? idByKey.get(`${row.classId}:${row.topicKey}`) : undefined);
    if (!topicId) continue;
    const list = byTopic.get(topicId);
    if (list) list.push(row);
    else byTopic.set(topicId, [row]);
  }
  const estimates = new Map<string, TopicEstimate>();
  for (const t of confirmed) estimates.set(t.id, estimateTopic((byTopic.get(t.id) ?? []).map(toObservation), now));

  const view = (t: (typeof topics)[number]): TopicView => ({
    id: t.id,
    classId: t.classId,
    title: t.title,
    parentId: t.parentId,
    position: t.position,
    source: t.source,
    status: t.status,
    estimate: estimates.get(t.id) ?? estimateTopic([], now),
    prerequisiteIds: edges.filter((e) => e.topicId === t.id).map((e) => e.prerequisiteId),
    remediation: t.status === "CONFIRMED" ? recommendRemediation(t.id, confirmed, edges, estimates) : null,
  });
  const views = treeOrder(confirmed).map(view);
  return {
    topics: views,
    proposed: treeOrder(topics.filter((t) => t.status === "PROPOSED")).map(view),
    edges,
    review: reviewQueue(
      views.map((v) => ({ topicId: v.id, classId: v.classId, title: v.title, estimate: v.estimate })),
      now,
    ),
  };
}

const TOPIC_SELECT = { id: true, classId: true, title: true, key: true, parentId: true, position: true, source: true, status: true } as const;

/** One course's topic map with estimates, remediation and the review queue. Null if the course isn't this student's. */
export async function getCourseLearning(userId: string, classId: string, now: Date = new Date()): Promise<CourseLearning | null> {
  const course = await db.class.findFirst({ where: { id: classId, userId }, select: { id: true } });
  if (!course) return null;
  const [topics, edges, evidence] = await Promise.all([
    db.courseTopic.findMany({ where: { userId, classId }, select: TOPIC_SELECT }),
    db.topicPrerequisite.findMany({ where: { userId, classId }, select: { topicId: true, prerequisiteId: true } }),
    db.masteryEvidence.findMany({
      where: { userId, OR: [{ topic: { classId } }, { topicId: null, classId }] },
      orderBy: { createdAt: "asc" },
      take: 5000,
      select: EVIDENCE_SELECT,
    }),
  ]);
  return buildCourse(topics, edges, evidence, now);
}

export interface LearningOverview {
  courses: { id: string; name: string; color: string; archived: boolean; learning: CourseLearning }[];
  /** All due reviews across courses, most urgent first (for /mastery and, later, the planner). */
  review: ReviewItem[];
  /** Evidence (from photo checks) that isn't attached to any course topic yet, grouped by its own topic label. */
  unlinked: { key: string; label: string; classId: string | null; estimate: TopicEstimate }[];
}

/** Every course's learning state, for the cross-course mastery overview. */
export async function getLearningOverview(userId: string, now: Date = new Date()): Promise<LearningOverview> {
  const [classes, topics, edges, evidence] = await Promise.all([
    db.class.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true, archived: true } }),
    db.courseTopic.findMany({ where: { userId }, select: TOPIC_SELECT }),
    db.topicPrerequisite.findMany({ where: { userId }, select: { topicId: true, prerequisiteId: true, classId: true } }),
    db.masteryEvidence.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: 10000, select: EVIDENCE_SELECT }),
  ]);
  const confirmedKeys = new Set(topics.filter((t) => t.status === "CONFIRMED").map((t) => `${t.classId}:${t.key}`));
  const courses = classes.map((c) => {
    const ids = new Set(topics.filter((t) => t.classId === c.id).map((t) => t.id));
    return {
      ...c,
      learning: buildCourse(
        topics.filter((t) => t.classId === c.id),
        edges.filter((e) => e.classId === c.id),
        evidence.filter((row) => (row.topicId ? ids.has(row.topicId) : row.classId === c.id)),
        now,
      ),
    };
  });

  const unlinkedRows = new Map<string, EvidenceWithTopic[]>();
  for (const row of evidence) {
    if (row.topicId) continue;
    if (row.classId && confirmedKeys.has(`${row.classId}:${row.topicKey}`)) continue;
    const groupKey = `${row.classId ?? ""}:${row.topicKey}`;
    const list = unlinkedRows.get(groupKey);
    if (list) list.push(row);
    else unlinkedRows.set(groupKey, [row]);
  }
  const unlinked = [...unlinkedRows.values()].map((rows) => ({
    key: rows[0].topicKey,
    label: rows[rows.length - 1].topicLabel,
    classId: rows[0].classId,
    estimate: estimateTopic(rows.map(toObservation), now),
  }));

  const active = courses.filter((c) => !c.archived);
  const review = reviewQueue(
    active.flatMap((c) => c.learning.topics.map((t) => ({ topicId: t.id, classId: c.id, title: t.title, estimate: t.estimate }))),
    now,
  );
  return { courses, review, unlinked };
}
