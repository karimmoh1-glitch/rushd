import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeStreakCard, formatStudyTime } from "@/lib/share/streak-card";

// A student's shared study card. No name or school: just the streak and this
// week's study time, signed so they can't be edited. The button is their
// invite link.

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const card = decodeStreakCard((await params).token);
  if (!card) return { title: "Rushd", robots: { index: false } };
  return {
    title: { absolute: `${card.streak}-day study streak on Rushd` },
    description: "A friend is studying with Rushd, the AI study agent that ranks your work and plans your week. Rank your own week free.",
    robots: { index: false, follow: false },
  };
}

export default async function SharedStreak({ params }: { params: Promise<{ token: string }> }) {
  const card = decodeStreakCard((await params).token);
  if (!card) notFound();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-border bg-card p-8 sm:p-10">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span aria-hidden="true" className="pulse-live h-2 w-2 rounded-full bg-signal" />A friend is studying with Rushd
        </p>
        <p className="mt-6 font-display text-7xl font-medium tabular-nums tracking-tight sm:text-8xl">{card.streak}</p>
        <p className="mt-1 text-lg">{card.streak === 1 ? "day" : "days"} in a row of real studying</p>
        {card.minutes > 0 && <p className="mt-1 text-muted-foreground">{formatStudyTime(card.minutes)} studied this week</p>}
        <div aria-hidden="true" className="mt-8 flex items-center gap-[10px]">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={i < Math.min(7, card.streak) ? (i === Math.min(7, card.streak) - 1 ? "h-2.5 w-2.5 rounded-full bg-signal" : "h-2.5 w-2.5 rounded-full bg-foreground") : "h-2.5 w-2.5 rounded-full bg-foreground/15"} />
          ))}
        </div>
      </div>
      <h1 className="mt-10 font-display text-3xl font-medium tracking-tight">Start your own streak.</h1>
      <p className="mt-2 text-muted-foreground">
        Rushd ranks everything you have due, plans your week around your free time, and tells you what to do next. Join with
        this link and you both get extra tutor messages every month.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href={`/r/${card.code}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          Start free with this invite
        </Link>
        <Link href="/tools/rank-my-week" className="text-sm font-medium underline-offset-4 hover:underline">
          Just rank my homework
        </Link>
      </div>
    </div>
  );
}
