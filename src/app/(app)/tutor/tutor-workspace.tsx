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

/** Minimal, safe rendering of the tutor's Markdown subset: paragraphs,
 * bullet/numbered lists, **bold**, `code`, and [n] citation references.
 * Never uses innerHTML. */
function RichText({ text, sources }: { text: string; sources: Source[] }) {
  const inline = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(part)) return <code key={`${key}-${i}`} className="rounded bg-muted px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
      const cite = part.match(/^\[(\d{1,2})\]$/);
      if (cite && sources.some((s) => s.n === Number(cite[1]))) {
        return (
          <sup key={`${key}-${i}`}>
            <a href={`#src-${cite[1]}`} className="px-0.5 text-[0.75em] font-medium text-muted-foreground hover:text-foreground">
              [{cite[1]}]
            </a>
          </sup>
        );
      }
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
    });

  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${bi}-${li}`)}</li>)}
            </ul>
          );
        }
        if (lines.length && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `${bi}-${li}`)}</li>)}
            </ol>
          );
        }
        const heading = lines.length === 1 && lines[0].match(/^#{1,4}\s+(.*)$/);
        if (heading) return <p key={bi} className="font-semibold">{inline(heading[1], `${bi}`)}</p>;
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
      {sources.map((s) => (
        <li key={s.n} id={`src-${s.n}`} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono">[{s.n}]</span>
          <span className="text-foreground">{s.title}</span>
          <span>· {KIND_LABEL[s.kind] ?? s.kind} · {s.className}</span>
          {s.url && (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
              Canvas <ExternalLink className="h-3 w-3" aria-label="(opens in a new tab)" />
            </a>
          )}
        </li>
      ))}
    </ol>
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
}: {
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
  const [mode, setMode] = useState<Mode>((active?.mode as Mode) ?? (prefill.assignmentId ? "plan" : "explain"));
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<{ text: string; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const locked = conversationId !== null; // context is fixed once a conversation starts

  const scrollToEnd = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || streaming) return;
    setError(null);
    setDraft("");
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", content: text, sources: [] };
    setMessages((m) => [...m, optimistic]);
    setStreaming({ text: "", status: "Thinking…" });
    scrollToEnd();

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text, classId, assignmentId, mode }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "The tutor couldn't answer right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "start") {
            if (!conversationId) {
              setConversationId(event.conversationId);
              window.history.replaceState(null, "", `/tutor?c=${event.conversationId}`);
            }
          } else if (event.type === "status") {
            setStreaming({ text: acc, status: event.text });
          } else if (event.type === "text") {
            acc += event.delta;
            setStreaming({ text: acc, status: null });
            scrollToEnd();
          } else if (event.type === "done") {
            setMessages((m) => [...m, { id: event.message.id, role: "assistant", content: event.message.content, sources: event.message.sources }]);
            finished = true;
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      if (!finished) throw new Error("The connection closed before the answer finished.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setDraft(text);
    } finally {
      setStreaming(null);
      scrollToEnd();
    }
  }

  function removeConversation(id: string) {
    startDelete(async () => {
      const result = await deleteTutorConversation(id);
      if ("error" in result) toast.error(result.error);
      else if (id === conversationId) router.push("/tutor");
      else router.refresh();
    });
  }

  function removeAll() {
    if (!window.confirm("Delete every tutor conversation? This can't be undone.")) return;
    startDelete(async () => {
      const result = await deleteAllTutorConversations();
      if ("error" in result) toast.error(result.error);
      else router.push("/tutor");
    });
  }

  const classAssignments = assignments.filter((a) => !classId || a.classId === classId);
  const activeClass = classes.find((c) => c.id === classId);
  const activeAssignment = assignments.find((a) => a.id === assignmentId);

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
              {conversations.map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <Link
                    href={`/tutor?c=${c.id}`}
                    aria-current={c.id === conversationId ? "page" : undefined}
                    className={cn(
                      "min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm",
                      c.id === conversationId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className="block truncate">{c.title}</span>
                    {c.className && <span className="block truncate text-xs text-muted-foreground">{c.className}</span>}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeConversation(c.id)}
                    disabled={deleting}
                    aria-label={`Delete conversation "${c.title}"`}
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
            <h1 className="text-2xl font-semibold tracking-tight">Tutor</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Grounded in your synced Canvas courses, with sources. It explains and gives feedback; it won&apos;t do graded
              work for you, and it can&apos;t change anything in Canvas.
            </p>
          </div>
          {locked ? (
            <p className="text-sm">
              <span className="text-muted-foreground">About: </span>
              {activeClass?.name ?? "All classes"}
              {activeAssignment && ` · ${activeAssignment.title}`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                Class
                <select
                  value={classId ?? ""}
                  onChange={(e) => {
                    setClassId(e.target.value || null);
                    setAssignmentId(null);
                  }}
                  className="block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Assignment
                <select
                  value={assignmentId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    setAssignmentId(id);
                    const a = assignments.find((x) => x.id === id);
                    if (a) setClassId(a.classId);
                  }}
                  className="block h-9 max-w-64 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">None</option>
                  {classAssignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Mode</legend>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                title={m.hint}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  mode === m.id ? "border-foreground/30 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </fieldset>
        </header>

        <div className="flex-1 space-y-6 py-6" aria-live="polite">
          {enabled && messages.length === 0 && !streaming && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Try one of these:</p>
              <ul className="space-y-1">
                {(activeAssignment
                  ? [`What is “${activeAssignment.title}” asking me to do?`, "Break this into steps I can finish tonight.", "Which rubric criteria are worth the most?"]
                  : ["What topics were covered in the last module?", "Quiz me on this week's material.", "What's due soon, and what should I start first?"]
                ).map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => setDraft(s)} className="text-left text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-[15px]">
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="max-w-prose">
                <RichText text={m.content} sources={m.sources} />
                <Sources sources={m.sources} />
              </div>
            ),
          )}
          {streaming && (
            <div className="max-w-prose">
              {streaming.text && <RichText text={stripMarkers(streaming.text)} sources={[]} />}
              {streaming.status && <p className="mt-2 animate-pulse text-sm text-muted-foreground">{streaming.status}</p>}
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
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
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
            class page.
          </p>
        )}
      </section>
    </div>
  );
}
