import "server-only";
import { db } from "@/lib/db";
import { topicKey } from "@/lib/practice/mastery";
import { wouldCreateCycle } from "./graph";

// The course topic map. Every function takes the signed-in student's userId
// and scopes every read and write by it, so another student's ids match
// nothing ("not found"), never a separate "forbidden".
//
// For other workstreams (syllabus import, course templates, AI suggestions):
//
//   const result = await proposeTopics(userId, classId, drafts, "SYLLABUS");
//   // ...student reviews them in the Topics tab (or your own preview)...
//   await confirmTopics(userId, classId, result.ids);
//
// proposeTopics() only creates PROPOSED topics. Proposed topics are shown for
// review, are never used for mastery or review scheduling, and can be
// dismissed with dismissProposedTopics(). Drafts whose title matches an
// existing topic in the course (same key) are skipped, not duplicated.

export type TopicSourceValue = "STUDENT" | "SYLLABUS" | "TEMPLATE" | "AI_SUGGESTED";

export interface TopicDraft {
  title: string;
  /** Title of the parent topic: another draft in the same call or an existing topic. */
  parentTitle?: string | null;
}

export type TopicResult<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string };

export const MAX_TOPICS_PER_COURSE = 200;
const MAX_TITLE = 120;

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

async function ownedClass(userId: string, classId: string) {
  return db.class.findFirst({ where: { id: classId, userId }, select: { id: true, name: true } });
}

/** Links evidence recorded before a topic existed (same key, same course or no course) to it. */
export async function linkEvidenceToTopics(userId: string, classId: string): Promise<number> {
  const topics = await db.courseTopic.findMany({
    where: { userId, classId, status: "CONFIRMED" },
    select: { id: true, key: true },
  });
  let linked = 0;
  for (const topic of topics) {
    const result = await db.masteryEvidence.updateMany({
      where: { userId, topicId: null, topicKey: topic.key, OR: [{ classId }, { classId: null }] },
      data: { topicId: topic.id, classId },
    });
    linked += result.count;
  }
  return linked;
}

/** Creates PROPOSED topics for the student to confirm. See the note at the top of this file. */
export async function proposeTopics(
  userId: string,
  classId: string,
  drafts: TopicDraft[],
  source: TopicSourceValue,
): Promise<TopicResult<{ ids: string[]; skipped: number }>> {
  const course = await ownedClass(userId, classId);
  if (!course) return { ok: false, error: "Course not found." };

  const existing = await db.courseTopic.findMany({ where: { userId, classId }, select: { id: true, key: true, parentId: true } });
  if (existing.length + drafts.length > MAX_TOPICS_PER_COURSE) {
    return { ok: false, error: `A course can have up to ${MAX_TOPICS_PER_COURSE} topics.` };
  }
  const idByKey = new Map(existing.map((t) => [t.key, t.id]));
  const parentOf = new Map(existing.map((t) => [t.id, t.parentId]));
  let position = existing.length;
  const ids: string[] = [];
  let skipped = 0;

  // Parents first, so subtopics can find them.
  const ordered = [...drafts].sort((a, b) => Number(Boolean(a.parentTitle)) - Number(Boolean(b.parentTitle)));
  for (const draft of ordered) {
    const title = cleanTitle(draft.title ?? "");
    const key = topicKey(title);
    if (!title || !key || idByKey.has(key)) {
      skipped += 1;
      continue;
    }
    let parentId: string | null = null;
    if (draft.parentTitle) {
      const candidate = idByKey.get(topicKey(cleanTitle(draft.parentTitle))) ?? null;
      // One level deep: a subtopic's parent must itself be top-level.
      if (candidate && !parentOf.get(candidate)) parentId = candidate;
    }
    const created = await db.courseTopic.create({
      data: { userId, classId, title, key, parentId, position: position++, source, status: "PROPOSED" },
      select: { id: true },
    });
    idByKey.set(key, created.id);
    parentOf.set(created.id, parentId);
    ids.push(created.id);
  }
  return { ok: true, ids, skipped };
}

/** Confirms proposed topics; they then count for mastery and review. */
export async function confirmTopics(userId: string, classId: string, topicIds: string[]): Promise<TopicResult<{ confirmed: number }>> {
  const course = await ownedClass(userId, classId);
  if (!course) return { ok: false, error: "Course not found." };
  const result = await db.courseTopic.updateMany({
    where: { id: { in: topicIds.slice(0, MAX_TOPICS_PER_COURSE) }, userId, classId, status: "PROPOSED" },
    data: { status: "CONFIRMED" },
  });
  if (result.count > 0) await linkEvidenceToTopics(userId, classId);
  return { ok: true, confirmed: result.count };
}

/** Removes proposed topics the student doesn't want. Confirmed topics are untouched. */
export async function dismissProposedTopics(userId: string, classId: string, topicIds: string[]): Promise<TopicResult<{ dismissed: number }>> {
  const result = await db.courseTopic.deleteMany({
    where: { id: { in: topicIds.slice(0, MAX_TOPICS_PER_COURSE) }, userId, classId, status: "PROPOSED" },
  });
  return { ok: true, dismissed: result.count };
}

/** A topic the student types in: confirmed straight away. */
export async function addTopic(userId: string, classId: string, input: { title: string; parentId?: string | null }): Promise<TopicResult> {
  const course = await ownedClass(userId, classId);
  if (!course) return { ok: false, error: "Course not found." };
  const title = cleanTitle(input.title);
  const key = topicKey(title);
  if (!title || !key) return { ok: false, error: "Give the topic a name." };
  const count = await db.courseTopic.count({ where: { userId, classId } });
  if (count >= MAX_TOPICS_PER_COURSE) return { ok: false, error: `A course can have up to ${MAX_TOPICS_PER_COURSE} topics.` };
  const duplicate = await db.courseTopic.findFirst({ where: { userId, classId, key }, select: { id: true, status: true } });
  if (duplicate) {
    return { ok: false, error: duplicate.status === "PROPOSED" ? "That topic is already waiting for you to confirm it." : "This course already has that topic." };
  }
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await db.courseTopic.findFirst({ where: { id: input.parentId, userId, classId }, select: { id: true, parentId: true } });
    if (!parent) return { ok: false, error: "Parent topic not found." };
    if (parent.parentId) return { ok: false, error: "Subtopics can't have their own subtopics." };
    parentId = parent.id;
  }
  const last = await db.courseTopic.findFirst({ where: { userId, classId }, orderBy: { position: "desc" }, select: { position: true } });
  const created = await db.courseTopic.create({
    data: { userId, classId, title, key, parentId, position: (last?.position ?? -1) + 1, source: "STUDENT", status: "CONFIRMED" },
    select: { id: true },
  });
  await linkEvidenceToTopics(userId, classId);
  return { ok: true, id: created.id };
}

export async function updateTopic(
  userId: string,
  topicId: string,
  input: { title?: string; parentId?: string | null },
): Promise<TopicResult> {
  const topic = await db.courseTopic.findFirst({
    where: { id: topicId, userId },
    select: { id: true, classId: true, key: true, _count: { select: { children: true } } },
  });
  if (!topic) return { ok: false, error: "Topic not found." };
  const data: { title?: string; key?: string; parentId?: string | null } = {};
  if (input.title !== undefined) {
    const title = cleanTitle(input.title);
    const key = topicKey(title);
    if (!title || !key) return { ok: false, error: "Give the topic a name." };
    if (key !== topic.key) {
      const clash = await db.courseTopic.findFirst({ where: { userId, classId: topic.classId, key, NOT: { id: topic.id } }, select: { id: true } });
      if (clash) return { ok: false, error: "This course already has that topic." };
    }
    data.title = title;
    data.key = key;
  }
  if (input.parentId !== undefined) {
    if (input.parentId === null) {
      data.parentId = null;
    } else {
      if (input.parentId === topic.id) return { ok: false, error: "A topic can't be its own subtopic." };
      if (topic._count.children > 0) return { ok: false, error: "This topic has subtopics, so it can't become a subtopic itself." };
      const parent = await db.courseTopic.findFirst({
        where: { id: input.parentId, userId, classId: topic.classId },
        select: { id: true, parentId: true },
      });
      if (!parent) return { ok: false, error: "Parent topic not found." };
      if (parent.parentId) return { ok: false, error: "Subtopics can't have their own subtopics." };
      data.parentId = parent.id;
    }
  }
  const result = await db.courseTopic.updateMany({ where: { id: topic.id, userId }, data });
  if (result.count === 0) return { ok: false, error: "Topic not found." };
  return { ok: true, id: topic.id };
}

/** Moves a topic one place up or down among its siblings. */
export async function moveTopic(userId: string, topicId: string, direction: "up" | "down"): Promise<TopicResult> {
  const topic = await db.courseTopic.findFirst({ where: { id: topicId, userId }, select: { id: true, classId: true, parentId: true } });
  if (!topic) return { ok: false, error: "Topic not found." };
  const siblings = await db.courseTopic.findMany({
    where: { userId, classId: topic.classId, parentId: topic.parentId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = siblings.findIndex((s) => s.id === topic.id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return { ok: true, id: topic.id };
  const order = siblings.map((s) => s.id);
  [order[index], order[swapWith]] = [order[swapWith], order[index]];
  await reorderTopics(userId, topic.classId, order);
  return { ok: true, id: topic.id };
}

/** Sets positions from an ordered list of the course's topic ids. Ids that
 * aren't this student's topics in this course are ignored. */
export async function reorderTopics(userId: string, classId: string, orderedIds: string[]): Promise<TopicResult<{ updated: number }>> {
  const course = await ownedClass(userId, classId);
  if (!course) return { ok: false, error: "Course not found." };
  let updated = 0;
  await db.$transaction(
    orderedIds.slice(0, MAX_TOPICS_PER_COURSE).map((id, position) =>
      db.courseTopic.updateMany({ where: { id, userId, classId }, data: { position } }),
    ),
  ).then((results) => {
    for (const r of results) updated += r.count;
  });
  return { ok: true, updated };
}

/** Deletes a topic. Its subtopics move up a level; its evidence and questions
 * stay (unlinked), so nothing the student practiced is lost. */
export async function deleteTopic(userId: string, topicId: string): Promise<TopicResult> {
  const result = await db.courseTopic.deleteMany({ where: { id: topicId, userId } });
  if (result.count === 0) return { ok: false, error: "Topic not found." };
  return { ok: true, id: topicId };
}

/** "topicId needs prerequisiteId first". Same student, same course, no cycles. */
export async function addPrerequisite(userId: string, topicId: string, prerequisiteId: string): Promise<TopicResult> {
  if (topicId === prerequisiteId) return { ok: false, error: "A topic can't be its own prerequisite." };
  const [topic, prerequisite] = await Promise.all([
    db.courseTopic.findFirst({ where: { id: topicId, userId }, select: { id: true, classId: true } }),
    db.courseTopic.findFirst({ where: { id: prerequisiteId, userId }, select: { id: true, classId: true } }),
  ]);
  if (!topic || !prerequisite) return { ok: false, error: "Topic not found." };
  if (topic.classId !== prerequisite.classId) return { ok: false, error: "Prerequisites must be in the same course." };
  const edges = await db.topicPrerequisite.findMany({
    where: { userId, classId: topic.classId },
    select: { topicId: true, prerequisiteId: true },
  });
  if (edges.some((e) => e.topicId === topicId && e.prerequisiteId === prerequisiteId)) return { ok: false, error: "That prerequisite is already set." };
  if (wouldCreateCycle(edges, topicId, prerequisiteId)) {
    return { ok: false, error: "That would make a loop: this topic is already (directly or indirectly) a prerequisite of the other one." };
  }
  const created = await db.topicPrerequisite.create({
    data: { userId, classId: topic.classId, topicId, prerequisiteId },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

export async function removePrerequisite(userId: string, topicId: string, prerequisiteId: string): Promise<TopicResult> {
  const result = await db.topicPrerequisite.deleteMany({ where: { userId, topicId, prerequisiteId } });
  if (result.count === 0) return { ok: false, error: "Prerequisite not found." };
  return { ok: true, id: topicId };
}
