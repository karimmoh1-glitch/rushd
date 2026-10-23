"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarPlus, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasteryChip } from "@/components/learning/mastery-chip";
import { formatDateKey, formatMinuteOfDay } from "@/lib/time/zone";
import type { CheckCard, GradedCard, PracticeOfferCard, RevisionPlanCard, TutorCard } from "@/lib/tutor/cards";
import { acceptTutorPracticeOfferAction, acceptTutorRevisionPlanAction, takeTutorHintAction } from "@/server/actions/tutor";

// Cards the server attached to a tutor reply. Buttons here are the student's
// own confirmations: nothing is scheduled or generated without them.

const frame = "rounded-xl bg-card p-4 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]";
const eyebrow = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function CheckQuestion({ card, closed }: { card: CheckCard; closed: boolean }) {
  const [hints, setHints] = useState<string[]>([]);
  const [left, setLeft] = useState(card.hintsAvailable);
  const [pending, startTransition] = useTransition();
  function hint() {
    startTransition(async () => {
      const result = await takeTutorHintAction({ checkId: card.checkId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setHints((current) => [...current, result.hint ?? "No more written hints. Ask the tutor for a nudge."]);
      setLeft(result.remaining);
    });
  }
  return (
    <section className={frame} aria-label="Check question">
      <p className={eyebrow}>Check question{card.topicTitle ? ` · ${card.topicTitle}` : ""}</p>
      <p className="mt-2 whitespace-pre-line text-[15px] font-medium">{card.prompt}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {card.origin === "AI_GENERATED" ? "From your practice bank · AI-generated, unverified" : "Your own question, from your practice bank"}
      </p>
      {hints.length > 0 && (
        <ol className="mt-3 space-y-1.5 text-sm">
          {hints.map((text, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-signal-ink" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ol>
      )}
      {!closed && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground">Answer in the message box. The tutor marks it against the question&apos;s answer, and it counts as practice.</p>
          {left > 0 && (
            <Button variant="outline" size="sm" className="min-h-9" onClick={hint} disabled={pending}>
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? "Getting a hint…" : "Show a hint"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

const RESULT_TEXT: Record<GradedCard["result"], string> = { CORRECT: "Correct", PARTIAL: "Partly right", INCORRECT: "Not yet" };

function Graded({ card }: { card: GradedCard }) {
  return (
    <section className={frame} aria-label="Marked answer">
      <p className={eyebrow}>Marked by the tutor</p>
      <p className="mt-1 text-[15px] font-medium">
        {RESULT_TEXT[card.result]}
        {card.hintsUsed > 0 && <span className="font-normal text-muted-foreground"> · {card.hintsUsed} hint{card.hintsUsed === 1 ? "" : "s"} used</span>}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Recorded as practice{card.topicTitle ? ` for ${card.topicTitle}` : ""}.
        {card.after && (
          <>
            {card.before && card.before !== card.after && (
              <>
                <MasteryChip status={card.before} />
                <span aria-hidden="true">→</span>
              </>
            )}
            <MasteryChip status={card.after} />
          </>
        )}
      </p>
    </section>
  );
}

function RevisionPlan({ card, conversationId, messageId }: { card: RevisionPlanCard; conversationId: string | null; messageId: string }) {
  const [accepted, setAccepted] = useState(card.accepted);
  const [pending, startTransition] = useTransition();
  const canAccept = conversationId !== null && !messageId.startsWith("local-") && card.sessions.length > 0;
  function accept() {
    if (!conversationId) return;
    startTransition(async () => {
      const result = await acceptTutorRevisionPlanAction({ conversationId, messageId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setAccepted({ added: result.added, skipped: result.skipped });
      if (result.skipped > 0) toast.message(`Added ${result.added}; ${result.skipped} couldn't be placed (${result.errors[0] ?? "conflict"}).`);
      else toast.success(`Added ${result.added} review session${result.added === 1 ? "" : "s"} to your plan.`);
    });
  }
  const when = card.daysLeft === 0 ? "today" : card.daysLeft === 1 ? "tomorrow" : `in ${card.daysLeft} days`;
  return (
    <section className={frame} aria-label="Revision plan">
      <p className={eyebrow}>Revision plan</p>
      <p className="mt-1 font-display text-lg leading-snug">
        {card.examTitle} <span className="text-muted-foreground">· {when}</span>
      </p>
      {card.sessions.length > 0 && (
        <ol className="mt-3 divide-y divide-border text-sm">
          {card.sessions.map((s) => (
            <li key={s.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
              <span className="font-medium">
                {formatDateKey(s.date, { weekday: "short", month: "short", day: "numeric" })}
                <span className="font-normal text-muted-foreground"> · {formatMinuteOfDay(s.startMinute)} · {s.minutes} min</span>
              </span>
              <span className="text-muted-foreground">
                {s.kind === "mixed" ? "Mixed review: " : ""}
                {s.topics.join(", ")}
              </span>
            </li>
          ))}
        </ol>
      )}
      {card.notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        {accepted ? (
          <p className="text-sm">
            Added {accepted.added} session{accepted.added === 1 ? "" : "s"} to your{" "}
            <Link href="/plan" className="underline underline-offset-4">
              plan
            </Link>
            {accepted.skipped > 0 ? ` (${accepted.skipped} couldn't be placed)` : ""}.
          </p>
        ) : canAccept ? (
          <Button variant="signal" className="min-h-9" onClick={accept} disabled={pending}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {pending ? "Adding…" : `Add ${card.sessions.length} session${card.sessions.length === 1 ? "" : "s"} to my plan`}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PracticeOffer({ card, conversationId, messageId }: { card: PracticeOfferCard; conversationId: string | null; messageId: string }) {
  const [generated, setGenerated] = useState(card.generated);
  const [pending, startTransition] = useTransition();
  const canGenerate = conversationId !== null && !messageId.startsWith("local-");
  function generate() {
    if (!conversationId) return;
    startTransition(async () => {
      const result = await acceptTutorPracticeOfferAction({ conversationId, messageId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setGenerated(result.generated);
    });
  }
  return (
    <section className={frame} aria-label="Practice offer">
      <p className={eyebrow}>Targeted practice · {card.topicTitle}</p>
      {generated !== null ? (
        <p className="mt-1 text-sm">
          Added {generated} AI-generated question{generated === 1 ? "" : "s"} (unverified) to your{" "}
          <Link href={`/courses/${card.classId}/practice`} className="underline underline-offset-4">
            practice bank
          </Link>
          . Report any that look wrong.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {card.count} question{card.count === 1 ? "" : "s"} for this topic, grounded in your topic list and any matching course materials. They&apos;re labeled AI-generated and unverified.
          </p>
          {canGenerate && (
            <Button variant="outline" className="mt-3 min-h-9" onClick={generate} disabled={pending}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {pending ? "Generating…" : `Generate ${card.count} question${card.count === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export function TutorCards({
  cards,
  conversationId,
  messageId,
  answeredChecks,
}: {
  cards: TutorCard[];
  conversationId: string | null;
  messageId: string;
  /** Checks graded later in the conversation; their hint buttons are hidden. */
  answeredChecks: Set<string>;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {cards.map((card, i) => {
        const key = `${messageId}-${i}`;
        switch (card.type) {
          case "check":
            return <CheckQuestion key={key} card={card} closed={answeredChecks.has(card.checkId)} />;
          case "graded":
            return <Graded key={key} card={card} />;
          case "prerequisite":
            return (
              <section key={key} className={frame} aria-label="Prerequisite to review">
                <p className={eyebrow}>Shore up first</p>
                <p className="mt-1 text-[15px] font-medium">{card.prerequisiteTitle ?? card.topicTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{card.reason}</p>
                <Link href={`/courses/${card.classId}/topics`} className="mt-2 inline-flex min-h-9 items-center text-sm underline underline-offset-4">
                  Open the topic map
                </Link>
              </section>
            );
          case "revision_plan":
            return <RevisionPlan key={key} card={card} conversationId={conversationId} messageId={messageId} />;
          case "practice_offer":
            return <PracticeOffer key={key} card={card} conversationId={conversationId} messageId={messageId} />;
        }
      })}
    </div>
  );
}
