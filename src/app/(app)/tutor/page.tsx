import type { Metadata } from "next";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { tutorAvailable } from "@/lib/tutor/availability";
import { getLearningOverview } from "@/lib/learning/load";
import { getMistakes } from "@/lib/learning/practice";
import { readCards } from "@/lib/tutor/cards";
import { loadContextSummaries } from "@/lib/tutor/course-context";
import { TutorWorkspace, type ConversationSummary, type ChatMessage, type FocusPrefill } from "./tutor-workspace";
import type { FallbackData } from "./tutor-fallback";

export const metadata: Metadata = { title: "Tutor" };

const SourcesSchema = z
  .array(
    z.object({ n: z.number(), id: z.string(), classId: z.string().nullish(), title: z.string(), kind: z.string(), className: z.string(), url: z.string().nullable() }),
  )
  .catch([]);

/** The no-AI path: due reviews and each course's practice and mistakes. */
async function loadFallback(userId: string, classes: { id: string; name: string; color: string }[], full: boolean): Promise<FallbackData> {
  if (!full) {
    return { reviews: [], courses: classes.map((c) => ({ ...c, openMistakes: null })) };
  }
  const [overview, mistakes] = await Promise.all([
    getLearningOverview(userId),
    Promise.all(classes.slice(0, 12).map((c) => getMistakes(userId, c.id))),
  ]);
  const names = new Map(classes.map((c) => [c.id, c.name]));
  return {
    reviews: overview.review
      .filter((r) => names.has(r.classId))
      .slice(0, 12)
      .map((r) => ({ topicTitle: r.title, classId: r.classId, className: names.get(r.classId)!, reason: r.reason, minutes: r.minutes })),
    courses: classes.map((c, i) => ({
      ...c,
      openMistakes: i < 12 ? (mistakes[i] ?? []).filter((m) => !m.resolved && !m.hidden).length : null,
    })),
  };
}

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; classId?: string; assignmentId?: string; ask?: string; topic?: string; mistake?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [conversations, classes, assignments] = await Promise.all([
    db.tutorConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        mode: true,
        classId: true,
        assignmentId: true,
        updatedAt: true,
        class: { select: { name: true } },
        focusTopic: { select: { title: true } },
        focusQuestionId: true,
      },
    }),
    db.class.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true } }),
    db.assignment.findMany({
      where: { userId: user.id, status: { not: "COMPLETED" }, class: { archived: false } },
      orderBy: { dueAt: "asc" },
      take: 100,
      select: { id: true, title: true, classId: true },
    }),
  ]);

  // The open conversation, only if it is one of this student's own.
  let active: (typeof conversations)[number] | null = null;
  if (params.c) {
    active = conversations.find((conversation) => conversation.id === params.c) ?? null;
  }

  let messages: ChatMessage[] = [];
  if (active) {
    const rows = await db.tutorMessage.findMany({
      where: { conversationId: active.id, conversation: { userId: user.id } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, sources: true, cards: true },
    });
    messages = rows.map((row) => ({
      id: row.id,
      role: row.role === "user" ? "user" : "assistant",
      content: row.content,
      sources: SourcesSchema.parse(row.sources ?? []),
      cards: row.role === "assistant" ? readCards(row.cards) : [],
    }));
  }

  const summaries: ConversationSummary[] = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    className: conversation.class?.name ?? null,
    classId: conversation.classId,
    assignmentId: conversation.assignmentId,
  }));
  let activeSummary: ConversationSummary | null = null;
  if (active) {
    activeSummary = summaries.find((summary) => summary.id === active.id)!;
  }

  // A link can open the tutor about one assignment or one class (ignored unless it's the student's own).
  let prefillAssignment: (typeof assignments)[number] | undefined;
  if (params.assignmentId) {
    prefillAssignment = assignments.find((assignment) => assignment.id === params.assignmentId);
  }
  let prefillClassId: string | null = null;
  if (prefillAssignment) {
    prefillClassId = prefillAssignment.classId;
  } else if (classes.some((c) => c.id === params.classId)) {
    prefillClassId = params.classId!;
  }

  // "Ask the tutor about this mistake / topic": only the student's own, only for a new conversation.
  const focus: FocusPrefill = { focusTopicId: null, focusQuestionId: null, label: null };
  let focusDraft = "";
  if (!active && params.mistake) {
    const question = await db.practiceQuestion.findFirst({
      where: { id: params.mistake.slice(0, 64), userId: user.id, class: { archived: false } },
      select: { id: true, classId: true, topic: { select: { title: true } } },
    });
    if (question) {
      focus.focusQuestionId = question.id;
      focus.label = question.topic ? `a missed ${question.topic.title} question` : "a missed question";
      prefillClassId = question.classId;
      focusDraft = "Help me understand where I went wrong on this question.";
    }
  } else if (!active && params.topic) {
    const topic = await db.courseTopic.findFirst({
      where: { id: params.topic.slice(0, 64), userId: user.id, status: "CONFIRMED", class: { archived: false } },
      select: { id: true, classId: true, title: true },
    });
    if (topic) {
      focus.focusTopicId = topic.id;
      focus.label = `topic: ${topic.title}`;
      prefillClassId = topic.classId;
      focusDraft = `Help me with ${topic.title}. Start by checking what I already know.`;
    }
  }

  // A question passed in the link (from "Review with tutor"), only for a new conversation.
  let initialDraft = "";
  if (!active) {
    initialDraft = (params.ask ?? "").slice(0, 600) || focusDraft;
  }

  const [enabled, courseSummaries] = await Promise.all([tutorAvailable(), loadContextSummaries(user.id)]);
  const fallback = await loadFallback(user.id, classes, !enabled);
  let activeFocusLabel: string | null = null;
  if (active?.focusTopic) activeFocusLabel = `topic: ${active.focusTopic.title}`;
  else if (active?.focusQuestionId) activeFocusLabel = "a missed question";

  return (
    <TutorWorkspace
      key={active?.id ?? "new"}
      enabled={enabled}
      summaries={courseSummaries}
      fallback={fallback}
      focus={focus}
      activeFocusLabel={activeFocusLabel}
      conversations={summaries}
      active={activeSummary}
      initialMessages={messages}
      classes={classes}
      assignments={assignments}
      initialDraft={initialDraft}
      prefill={{
        classId: prefillClassId,
        assignmentId: prefillAssignment?.id ?? null,
      }}
    />
  );
}
