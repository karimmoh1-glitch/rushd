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
  const sp = await searchParams;

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

  const active = sp.c ? conversations.find((c) => c.id === sp.c) ?? null : null;
  const messages: ChatMessage[] = active
    ? (
        await db.tutorMessage.findMany({
          where: { conversationId: active.id, conversation: { userId: user.id } },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: { id: true, role: true, content: true, sources: true },
        })
      ).map((m) => ({ id: m.id, role: m.role === "user" ? "user" : "assistant", content: m.content, sources: SourcesSchema.parse(m.sources ?? []) }))
    : [];

  const summaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    mode: c.mode,
    className: c.class?.name ?? null,
    classId: c.classId,
    assignmentId: c.assignmentId,
  }));
  const prefillAssignment = sp.assignmentId ? assignments.find((a) => a.id === sp.assignmentId) : undefined;

  return (
    <TutorWorkspace
      key={active?.id ?? "new"}
      enabled={aiEnabled}
      conversations={summaries}
      active={active ? summaries.find((s) => s.id === active.id)! : null}
      initialMessages={messages}
      classes={classes}
      assignments={assignments}
      initialDraft={active ? "" : (sp.ask ?? "").slice(0, 600)}
      prefill={{
        classId: prefillAssignment?.classId ?? (classes.some((c) => c.id === sp.classId) ? sp.classId! : null),
        assignmentId: prefillAssignment?.id ?? null,
      }}
    />
  );
}
