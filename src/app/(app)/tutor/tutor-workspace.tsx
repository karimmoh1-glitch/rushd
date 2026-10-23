"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteAllTutorConversations, deleteTutorConversation } from "@/server/actions/course";
import { stripMarkers } from "@/lib/tutor/citations";
import { cn } from "@/lib/utils";
import { PathLoader } from "@/components/brand/path-loader";

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  className: string | null;
  classId: string | null;
  assignmentId: string | null;
}

interface Source {
  n: number;
  id: string;
  title: string;
  kind: string;
  className: string;
  url: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
}

type Mode = "explain" | "quiz" | "plan";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "explain", label: "Explain", hint: "Walk through a concept" },
  { id: "quiz", label: "Quiz me", hint: "Practice questions, one at a time" },
  { id: "plan", label: "Plan it", hint: "Break work into steps" },
];

const KIND_LABEL: Record<string, string> = { PAGE: "Page", ASSIGNMENT: "Assignment", ANNOUNCEMENT: "Announcement", MODULE_ITEM: "Module item" };

const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,4}\s+(.*)$/;

/** Turns one line into text, **bold**, `code`, and [n] citation links. */
function renderInline(line: string, keyPrefix: string, sources: Source[]) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={key} className="rounded bg-muted px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    // Only link a citation when that source number really exists.
    const cite = part.match(/^\[(\d{1,2})\]$/);
    if (cite && sources.some((source) => source.n === Number(cite[1]))) {
      return (
        <sup key={key}>
          <a href={`#src-${cite[1]}`} className="px-0.5 text-[0.75em] font-medium text-muted-foreground hover:text-foreground">
            [{cite[1]}]
          </a>
        </sup>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** One paragraph-sized chunk of the answer: a list, a heading, or plain lines. */
function RichTextBlock({ block, blockIndex, sources }: { block: string; blockIndex: number; sources: Source[] }) {
  const lines = block.split("\n").filter((line) => line.trim());

  if (lines.length && lines.every((line) => BULLET.test(line))) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInline(line.replace(BULLET, ""), `${blockIndex}-${lineIndex}`, sources)}</li>
        ))}
      </ul>
    );
  }

  if (lines.length && lines.every((line) => NUMBERED.test(line))) {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInline(line.replace(NUMBERED, ""), `${blockIndex}-${lineIndex}`, sources)}</li>
        ))}
      </ol>
    );
  }

  const heading = lines.length === 1 ? lines[0].match(HEADING) : null;
  if (heading) {
    return <p className="font-semibold">{renderInline(heading[1], `${blockIndex}`, sources)}</p>;
  }

  return (
    <p>
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {renderInline(line, `${blockIndex}-${lineIndex}`, sources)}
        </Fragment>
      ))}
    </p>
  );
}

/** Safe rendering of the tutor's small Markdown subset. Never uses innerHTML. */
function RichText({ text, sources }: { text: string; sources: Source[] }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((block, blockIndex) => (
        <RichTextBlock key={blockIndex} block={block} blockIndex={blockIndex} sources={sources} />
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
      {sources.map((source) => (
        <li key={source.n} id={`src-${source.n}`} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono">[{source.n}]</span>
          <span className="text-foreground">{source.title}</span>
          <span>· {KIND_LABEL[source.kind] ?? source.kind} · {source.className}</span>
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
              Canvas <ExternalLink className="h-3 w-3" aria-label="(opens in a new tab)" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

function assignmentSuggestions(title: string): string[] {
  return [
    `What is “${title}” asking me to do?`,
    "Break this into steps I can finish tonight.",
    "Which rubric criteria are worth the most?",
  ];
}
const GENERAL_SUGGESTIONS = [
  "What topics were covered in the last module?",
  "Quiz me on this week's material.",
  "What's due soon, and what should I start first?",
];

/** A saved conversation keeps its mode; a new one about an assignment starts in "Plan it". */
function startingMode(
  active: ConversationSummary | null,
  prefill: { assignmentId: string | null },
): Mode {
  if (active) return active.mode as Mode;
  if (prefill.assignmentId) return "plan";
  return "explain";
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-[15px]">
        {message.content}
      </div>
    );
  }
  return (
    <div className="max-w-prose">
      <RichText text={message.content} sources={message.sources} />
      <Sources sources={message.sources} />
    </div>
  );
}

export function TutorWorkspace({
  enabled,
  conversations,
  active,
  initialMessages,
  classes,
  assignments,
  prefill,
  initialDraft = "",
}: {
  initialDraft?: string;
  enabled: boolean;
  conversations: ConversationSummary[];
  active: ConversationSummary | null;
  initialMessages: ChatMessage[];
  classes: { id: string; name: string; color: string }[];
  assignments: { id: string; title: string; classId: string }[];
  prefill: { classId: string | null; assignmentId: string | null };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(active?.id ?? null);
  const [classId, setClassId] = useState<string | null>(active?.classId ?? prefill.classId);
  const [assignmentId, setAssignmentId] = useState<string | null>(active?.assignmentId ?? prefill.assignmentId);
  const [mode, setMode] = useState<Mode>(startingMode(active, prefill));
  const [draft, setDraft] = useState(initialDraft);
  const [streaming, setStreaming] = useState<{ text: string; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  // The course and assignment are fixed once a conversation starts.
  const locked = conversationId !== null;

  function scrollToEnd() {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || streaming) return;
    setError(null);
    setDraft("");
    // Show the student's message right away; it is removed again if sending fails.
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", content: text, sources: [] };
    setMessages((current) => [...current, optimistic]);
    setStreaming({ text: "", status: "Thinking…" });
    scrollToEnd();

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text, classId, assignmentId, mode }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The tutor couldn't answer right now.");
      }

      // The answer streams back as one JSON event per line.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answerSoFar = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep a half-received line for the next chunk
        for (const line of lines) {
          if (!line.trim()) continue;
          const streamEvent = JSON.parse(line);
          if (streamEvent.type === "start") {
            if (!conversationId) {
              setConversationId(streamEvent.conversationId);
              window.history.replaceState(null, "", `/tutor?c=${streamEvent.conversationId}`);
            }
          } else if (streamEvent.type === "status") {
            setStreaming({ text: answerSoFar, status: streamEvent.text });
          } else if (streamEvent.type === "text") {
            answerSoFar += streamEvent.delta;
            setStreaming({ text: answerSoFar, status: null });
            scrollToEnd();
          } else if (streamEvent.type === "done") {
            const reply: ChatMessage = {
              id: streamEvent.message.id,
              role: "assistant",
              content: streamEvent.message.content,
              sources: streamEvent.message.sources,
            };
            setMessages((current) => [...current, reply]);
            finished = true;
          } else if (streamEvent.type === "error") {
            throw new Error(streamEvent.error);
          }
        }
      }
      if (!finished) throw new Error("The connection closed before the answer finished.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(text);
    } finally {
      setStreaming(null);
      scrollToEnd();
    }
  }

  function removeConversation(id: string) {
    startDelete(async () => {
      const result = await deleteTutorConversation(id);
      if ("error" in result) {
        toast.error(result.error);
      } else if (id === conversationId) {
        router.push("/tutor");
      } else {
        router.refresh();
      }
    });
  }

  function removeAll() {
    if (!window.confirm("Delete every tutor conversation? This can't be undone.")) return;
    startDelete(async () => {
      const result = await deleteAllTutorConversations();
      if ("error" in result) {
        toast.error(result.error);
      } else {
        router.push("/tutor");
      }
    });
  }

  function handleClassChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setClassId(event.target.value || null);
    setAssignmentId(null);
  }

  // Picking an assignment also picks its course.
  function handleAssignmentChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const id = event.target.value || null;
    setAssignmentId(id);
    const picked = assignments.find((assignment) => assignment.id === id);
    if (picked) setClassId(picked.classId);
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a new line. Ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const classAssignments = assignments.filter((assignment) => !classId || assignment.classId === classId);
  const activeClass = classes.find((c) => c.id === classId);
  const activeAssignment = assignments.find((assignment) => assignment.id === assignmentId);
  const suggestions = activeAssignment ? assignmentSuggestions(activeAssignment.title) : GENERAL_SUGGESTIONS;

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start" aria-label="Conversations">
        <Link href="/tutor" className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New conversation
        </Link>
        {conversations.length > 0 && (
          <>
            <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group flex items-center gap-1">
                  <Link
                    href={`/tutor?c=${conversation.id}`}
                    aria-current={conversation.id === conversationId ? "page" : undefined}
                    className={cn(
                      "min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm",
                      conversation.id === conversationId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className="block truncate">{conversation.title}</span>
                    {conversation.className && <span className="block truncate text-xs text-muted-foreground">{conversation.className}</span>}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeConversation(conversation.id)}
                    disabled={deleting}
                    aria-label={`Delete conversation "${conversation.title}"`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={removeAll} disabled={deleting} className="px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Delete all conversations
            </button>
          </>
        )}
      </aside>

      <section className="flex min-h-[70vh] flex-col" aria-label="Tutor conversation">
        <header className="space-y-3 border-b border-border pb-4">
          <div>
            <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Tutor</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Grounded in your synced Canvas courses, with sources. It explains and gives feedback; it won&apos;t do graded
              work for you, and it can&apos;t change anything in Canvas.
            </p>
          </div>
          {locked ? (
            <p className="text-sm">
              <span className="text-muted-foreground">About: </span>
              {activeClass?.name ?? "All courses"}
              {activeAssignment && ` · ${activeAssignment.title}`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                Course
                <select
                  value={classId ?? ""}
                  onChange={handleClassChange}
                  className="block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">All courses</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Assignment
                <select
                  value={assignmentId ?? ""}
                  onChange={handleAssignmentChange}
                  className="block h-9 max-w-64 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">None</option>
                  {classAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Mode</legend>
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={mode === option.id}
                title={option.hint}
                onClick={() => setMode(option.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  mode === option.id ? "border-foreground/30 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
        </header>

        <div className="flex-1 space-y-6 py-6" aria-live="polite">
          {enabled && messages.length === 0 && !streaming && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Try one of these:</p>
              <ul className="space-y-1">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button type="button" onClick={() => setDraft(suggestion)} className="text-left text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground">
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {streaming && (
            <div className="max-w-prose">
              {streaming.text && <RichText text={stripMarkers(streaming.text)} sources={[]} />}
              {streaming.status && (
                <p className="mt-2 flex items-center gap-2.5 text-sm text-muted-foreground">
                  <PathLoader label={streaming.status} />
                  {streaming.status}
                </p>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {enabled ? (
          <form onSubmit={send} className="sticky bottom-20 flex items-end gap-2 rounded-xl border border-border bg-background p-2 md:bottom-4">
            <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
            <Textarea
              id="tutor-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              rows={2}
              maxLength={4000}
              placeholder="Ask about your course…"
              className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || streaming !== null} aria-label="Send">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            The tutor isn&apos;t available on this server yet. Your synced course content is still browsable from each
            course page.
          </p>
        )}
      </section>
    </div>
  );
}
