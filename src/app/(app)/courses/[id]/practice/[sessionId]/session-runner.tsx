"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Flag, Lightbulb } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MasteryChip } from "@/components/learning/mastery-chip";
import type { SessionQuestion, SessionSummary } from "@/lib/learning/practice";
import type { MasteryStatusV2 } from "@/lib/learning/estimator";
import { cn } from "@/lib/utils";
import { completeSessionAction, recordAttemptAction } from "@/server/actions/learning";
import { ReportQuestionDialog } from "../question-tools";

type Result = "CORRECT" | "PARTIAL" | "INCORRECT";

const CONFIDENCE = [
  [1, "Unsure"],
  [2, "Fairly sure"],
  [3, "Sure"],
] as const;

const RESULTS: [Result, string][] = [
  ["CORRECT", "I got it"],
  ["PARTIAL", "Partly"],
  ["INCORRECT", "I missed it"],
];

/** Whole seconds since a timestamp (kept outside render code). */
function secondsSince(start: number): number {
  return Math.round((Date.now() - start) / 1000);
}

interface Change {
  topic: string;
  before: MasteryStatusV2 | null;
  after: MasteryStatusV2 | null;
}

function Summary({ courseId, summary, changes }: { courseId: string; summary: SessionSummary; changes: Change[] }) {
  const moved = changes.filter((c) => c.after && c.before !== c.after);
  return (
    <section aria-labelledby="summary-heading" className="rounded-xl bg-card px-5 py-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
      <h2 id="summary-heading" className="font-display text-2xl font-medium tracking-tight">
        Session done
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {summary.attempted === 0
          ? "No answers recorded this time."
          : `${summary.correct} of ${summary.attempted} correct${summary.partial ? `, ${summary.partial} partly` : ""}. Each answer is now evidence for its topic.`}
      </p>
      {moved.length > 0 && (
        <ul className="mt-4 space-y-2">
          {moved.map((c) => (
            <li key={c.topic} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{c.topic}</span>
              {c.before && <MasteryChip status={c.before} />}
              <span aria-hidden="true" className="text-muted-foreground">→</span>
              <span className="sr-only">changed to</span>
              <MasteryChip status={c.after!} />
            </li>
          ))}
        </ul>
      )}
      {summary.attempted > 0 && moved.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No topic changed status yet. Practicing again on another day is what moves an estimate.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/courses/${courseId}/topics`} className={buttonVariants({ variant: "default" })}>
          See topics
        </Link>
        {summary.incorrect + summary.partial > 0 && (
          <Link href={`/courses/${courseId}/mistakes`} className={buttonVariants({ variant: "outline" })}>
            Review mistakes
          </Link>
        )}
        <Link href={`/courses/${courseId}/practice`} className={buttonVariants({ variant: "ghost" })}>
          Back to practice
        </Link>
      </div>
    </section>
  );
}

export function SessionRunner({
  courseId,
  sessionId,
  completed,
  questions,
  answered,
  attemptPlaceholder,
  code,
}: {
  courseId: string;
  sessionId: string;
  completed: boolean;
  questions: SessionQuestion[];
  answered: string[];
  attemptPlaceholder: string;
  code: boolean;
}) {
  const remaining = questions.filter((q) => !answered.includes(q.id));
  const [queue, setQueue] = useState(remaining);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [pending, startTransition] = useTransition();
  const shownAt = useRef<number>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const question = queue[index];
  const total = answered.length + queue.length;
  const position = answered.length + index + 1;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [question?.id]);

  function finish() {
    startTransition(async () => {
      const result = await completeSessionAction({ classId: courseId, sessionId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
    });
  }

  function advance(nextQueue = queue) {
    setAttempt("");
    setConfidence(null);
    setHintsShown(0);
    setRevealed(false);
    if (index + 1 >= nextQueue.length) {
      finish();
    } else {
      setIndex(index + 1);
      headingRef.current?.focus();
    }
  }

  function reveal() {
    setRevealed(true);
  }

  function mark(result: Result) {
    if (!question) return;
    const timeTakenSec = secondsSince(shownAt.current);
    startTransition(async () => {
      const outcome = await recordAttemptAction({
        sessionId,
        questionId: question.id,
        result,
        hintsUsed: hintsShown,
        confidence,
        timeTakenSec,
        answer: attempt || null,
      });
      if ("error" in outcome) {
        toast.error(outcome.error);
        return;
      }
      if (question.topicTitle && outcome.after) {
        const title = question.topicTitle;
        setChanges((current) => {
          const existing = current.find((c) => c.topic === title);
          if (existing) return current.map((c) => (c.topic === title ? { ...c, after: outcome.after as MasteryStatusV2 } : c));
          return [...current, { topic: title, before: outcome.before as MasteryStatusV2 | null, after: outcome.after as MasteryStatusV2 }];
        });
      }
      advance();
    });
  }

  function afterReport() {
    // Drop the reported question and move on.
    const nextQueue = queue.filter((q) => q.id !== question?.id);
    setQueue(nextQueue);
    setAttempt("");
    setConfidence(null);
    setHintsShown(0);
    setRevealed(false);
    if (index >= nextQueue.length) finish();
  }

  if (summary) return <Summary courseId={courseId} summary={summary} changes={changes} />;
  if (completed || !question) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <p>{completed ? "This session is finished." : "Every question in this session has been answered."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!completed && (
            <Button onClick={finish} disabled={pending}>
              Finish session
            </Button>
          )}
          <Link href={`/courses/${courseId}/practice`} className={buttonVariants({ variant: "outline" })}>
            Back to practice
          </Link>
        </div>
      </div>
    );
  }

  const generated = question.origin === "AI_GENERATED";
  const hintsLeft = question.hints.length - hintsShown;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Question {position} of {total}
        </span>
        <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <span className="course-rule block h-full rounded-full transition-[width] duration-200" style={{ width: `${((position - 1) / total) * 100}%` }} />
        </span>
        <button type="button" onClick={finish} disabled={pending} className="min-h-9 px-1 underline-offset-4 hover:text-foreground hover:underline">
          Finish early
        </button>
      </div>

      <article className="rounded-xl bg-card px-4 py-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-6">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {question.topicTitle && (
            <>
              <span className="font-medium text-foreground/80">{question.topicTitle}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {generated ? (
            <span className="font-medium text-signal-ink">AI-generated · unverified</span>
          ) : (
            <span>Your question</span>
          )}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className={cn("mt-2 text-lg leading-relaxed whitespace-pre-wrap outline-none", code && "font-mono text-base")}>
          {question.prompt}
        </h2>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="attempt">Your answer (optional, only you see it)</Label>
          <Textarea
            id="attempt"
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder={attemptPlaceholder}
            className={cn("min-h-24", code && "font-mono")}
            readOnly={revealed}
          />
        </div>

        {!revealed && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">How sure are you? (optional)</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONFIDENCE.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={confidence === value ? "default" : "outline"}
                  aria-pressed={confidence === value}
                  onClick={() => setConfidence(confidence === value ? null : value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
        )}

        {hintsShown > 0 && (
          <ol className="mt-4 space-y-2">
            {question.hints.slice(0, hintsShown).map((hint, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-signal-ink" aria-hidden="true" />
                <span>
                  <span className="sr-only">Hint {i + 1}: </span>
                  {hint}
                </span>
              </li>
            ))}
          </ol>
        )}

        {!revealed ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {hintsLeft > 0 && (
              <Button variant="outline" onClick={() => setHintsShown(hintsShown + 1)}>
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                {hintsShown === 0 ? "Show a hint" : "Another hint"}
              </Button>
            )}
            <Button variant="signal" onClick={reveal}>
              Show the answer
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Answer</p>
              <p className={cn("mt-1.5 text-sm leading-relaxed whitespace-pre-wrap", code && "font-mono")}>{question.answer}</p>
              {question.explanation && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{question.explanation}</p>}
              {generated && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Written by AI and not checked by a teacher. {question.sourceNote}{" "}
                  <button type="button" onClick={() => setReporting(true)} className="inline-flex min-h-6 items-center gap-1 font-medium text-foreground underline underline-offset-4">
                    <Flag className="h-3 w-3" aria-hidden="true" />
                    Report a problem
                  </button>
                </p>
              )}
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Compare with your answer. How did you do?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {RESULTS.map(([value, label]) => (
                  <Button key={value} variant={value === "CORRECT" ? "default" : "outline"} size="lg" disabled={pending} onClick={() => mark(value)}>
                    {label}
                  </Button>
                ))}
              </div>
              {hintsShown > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  You used {hintsShown} hint{hintsShown === 1 ? "" : "s"}; Rushd counts that, so the estimate stays honest.
                </p>
              )}
            </fieldset>
          </div>
        )}
      </article>
      {generated && (
        <ReportQuestionDialog open={reporting} onOpenChange={setReporting} courseId={courseId} questionId={question.id} onReported={afterReport} />
      )}
    </div>
  );
}
