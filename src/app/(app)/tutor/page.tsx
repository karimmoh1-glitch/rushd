import type { Metadata } from "next";
import * as z from "zod";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { TutorWorkspace, type ConversationSummary, type ChatMessage } from "./tutor-workspace";

export const metadata: Metadata = { title: "Tutor" };

const SourcesSchema = z
  .array(z.object({ n: z.number(), id: z.string(), title: z.string(), kind: z.string(), className: z.string(), url: z.string().nullable() }))
  .catch([]);

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; classId?: string; assignmentId?: string; ask?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [conversations, classes, assignments] = await Promise.all([
    db.tutorConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, mode: true, classId: true, assignmentId: true, updatedAt: true, class: { select: { name: true } } },
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
      select: { id: true, role: true, content: true, sources: true },
    });
    messages = rows.map((row) => ({
      id: row.id,
      role: row.role === "user" ? "user" : "assistant",
      content: row.content,
      sources: SourcesSchema.parse(row.sources ?? []),
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

  // A question passed in the link (from "Review with tutor"), only for a new conversation.
  let initialDraft = "";
  if (!active) {
    initialDraft = (params.ask ?? "").slice(0, 600);
  }

  return (
    <TutorWorkspace
      key={active?.id ?? "new"}
      enabled={aiEnabled}
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
