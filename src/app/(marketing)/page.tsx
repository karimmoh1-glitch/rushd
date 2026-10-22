import Link from "next/link";
import { ArrowRight, BookOpenCheck, Check, KeyRound, Pencil, ScanText } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { HeroCopy } from "@/components/marketing/hero-copy";
import { HeroPreview, type PreviewData } from "@/components/marketing/hero-preview";
import { ChaosToPlan, type ChaosItem } from "@/components/marketing/chaos-to-plan";
import { ScheduleDemo } from "@/components/marketing/schedule-demo";
import { HowItWorks } from "@/components/marketing/how-it-works";
import {
  SAMPLE_NOW,
  SAMPLE_START,
  SAMPLE_TZ,
  runSamplePlan,
  sampleRanking,
} from "@/components/marketing/sample-week";
import { explainScore } from "@/lib/planning/explain";
import { REASON_LABELS } from "@/lib/planning/constants";
import { formatDateInZone, formatDateKey, formatTimeInZone } from "@/lib/time/zone";

function shortDue(date: Date): string {
  return `${formatDateInZone(date, SAMPLE_TZ, { weekday: "short" })} ${formatTimeInZone(date, SAMPLE_TZ)}`;
}

function buildPreview(): PreviewData {
  const plan = runSamplePlan();
  const tonight = plan.sessions.filter((s) => s.scheduledDate === SAMPLE_START);
  const first = tonight[0];
  const firstScored = plan.scored.find((s) => s.item.id === first.item.id)!;
  return {
    dayLabel: formatDateKey(SAMPLE_START, { weekday: "long", month: "short", day: "numeric" }),
    tonightMinutes: tonight.reduce((n, s) => n + s.scheduledMinutes, 0),
    next: {
      title: first.item.title,
      className: first.item.className,
      classColor: first.item.classColor,
      startMinute: first.startMinute ?? 0,
      minutes: first.scheduledMinutes,
      reasons: explainScore(firstScored, SAMPLE_NOW, plan.scored, SAMPLE_TZ).slice(0, 2),
    },
    blocks: tonight.slice(1).map((s, i) => ({
      key: `${s.item.id}-${i}`,
      title: s.item.title,
      className: s.item.className,
      classColor: s.item.classColor,
      startMinute: s.startMinute ?? 0,
      minutes: s.scheduledMinutes,
    })),
    week: (plan.days ?? []).map((d) => ({
      key: d.date,
      letter: formatDateKey(d.date, { weekday: "narrow" }),
      minutes: d.plannedMinutes,
    })),
  };
}

const SEGMENTS = [
  { key: "urgency", label: "Due soon", className: "bg-brand" },
  { key: "importance", label: "Priority", className: "bg-chart-2" },
  { key: "examProximity", label: "Exam proximity", className: "bg-chart-3" },
  { key: "overdue", label: "Overdue", className: "bg-destructive" },
  { key: "effortTiebreak", label: "Quick win", className: "bg-muted-foreground/40" },
] as const;

export default function LandingPage() {
  const preview = buildPreview();
  const ranking = sampleRanking();
  const chaosItems: ChaosItem[] = ranking.map((s) => ({
    key: s.item.id,
    title: s.item.title,
    className: s.item.className,
    classColor: s.item.classColor,
    dueLabel: shortDue(s.item.dueAt),
  }));
  const topFour = ranking.slice(0, 4);
  const maxScore = Math.max(...topFour.map((s) => s.score));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="dot-field pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_70%_30%,black,transparent)] opacity-60" />
        <div className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-14 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:px-8 lg:pt-16">
          <HeroCopy />
          <HeroPreview data={preview} />
        </div>
      </section>

      {/* The problem */}
      <section className="border-t border-border">
        <ChaosToPlan items={chaosItems} />
      </section>

      {/* Interactive planner */}
      <section id="demo" className="scroll-mt-16 border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Change your week. Watch the plan answer.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              This is Rushd&apos;s real scheduler running in your browser on a sample week. Change when you&apos;re free
              or drop in a surprise assignment, and every block moves to where it now belongs.
            </p>
          </Reveal>
          <Reveal>
            <div className="mt-10">
              <ScheduleDemo />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Canvas */}
      <section id="canvas" className="scroll-mt-16 border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand-ink">Canvas LMS integration</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Your whole workload, imported in a minute.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Reveal className="md:col-span-4 md:row-span-2">
              <div className="surface flex h-full flex-col justify-between gap-8 rounded-2xl p-6">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">Connect once. Every course comes with it.</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Paste your school&apos;s Canvas address and an access token. Pick your courses. Rushd imports each
                    assignment with its real due date, then plans it into your week.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
                  <ul className="space-y-2" aria-label="Example course selection">
                    {[
                      { name: "AP Chemistry", term: "CHEM-AP · Fall", color: "#2563eb", on: true },
                      { name: "Precalculus", term: "MATH-PC · Fall", color: "#7c3aed", on: true },
                      { name: "English 11", term: "ENG-11 · Fall", color: "#0d9488", on: true },
                      { name: "Homeroom", term: "HR · Fall", color: "#525252", on: false },
                    ].map((c) => (
                      <li
                        key={c.name}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${c.on ? "border-foreground/20" : "border-border text-muted-foreground"}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${c.on ? "border-foreground bg-foreground text-background" : "border-border"}`}
                        >
                          {c.on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{c.term}</span>
                        </span>
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                      </li>
                    ))}
                  </ul>
                  <ol className="flex flex-col justify-between gap-2 text-sm">
                    {[
                      { n: "Courses imported", ok: true },
                      { n: "Assignments and due dates gathered", ok: true },
                      { n: "Reviewed before anything changes", ok: true },
                      { n: "Plan rebuilt around real deadlines", ok: true },
                    ].map((s) => (
                      <li key={s.n} className="flex items-center gap-2.5">
                        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        {s.n}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Reveal>

            <Reveal className="md:col-span-2">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border p-6">
                <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-semibold">Your token stays sealed</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Encrypted with AES-256-GCM before it&apos;s stored, used only by Rushd&apos;s server, never shown again.
                  Disconnect anytime.
                </p>
              </div>
            </Reveal>

            <Reveal className="md:col-span-2">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-border p-6">
                <Pencil className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-semibold">Your edits stay yours</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Canvas keeps titles and due dates current. Your estimates, priorities, and locked study blocks are
                  never overwritten.
                </p>
              </div>
            </Reveal>

            <Reveal className="md:col-span-6">
              <div className="flex h-full flex-col gap-4 rounded-2xl border border-border p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-4">
                  <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold">No Canvas, or your school blocks tokens?</h3>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      Upload a screenshot of any calendar and review what Rushd reads, or type work in plain language.
                      Everything else works the same.
                    </p>
                  </div>
                </div>
                <BookOpenCheck className="hidden h-8 w-8 shrink-0 text-muted-foreground/60 sm:block" aria-hidden="true" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Transparency */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">It shows its work.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Every block comes with the reasons behind it: what&apos;s due, how much it&apos;s worth, and how much time
              is left. The schedule is computed by rules you can read, not guessed by a model.
            </p>
          </Reveal>
          <Reveal>
            <ol className="mt-12 space-y-6">
              {topFour.map((s, i) => (
                <li key={s.item.id} className="grid grid-cols-[1.5rem_1fr] items-center gap-x-4 gap-y-2">
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.item.className} · {REASON_LABELS[s.reasonCode]}
                    </p>
                  </div>
                  <div
                    className="col-start-2 flex h-2 overflow-hidden rounded-full"
                    style={{ width: `${(s.score / maxScore) * 100}%` }}
                    role="img"
                    aria-label={SEGMENTS.map((seg) => {
                      const raw = s.breakdown[seg.key];
                      const v = seg.key === "effortTiebreak" ? raw * 0.3 : raw;
                      return `${seg.label} ${v.toFixed(0)}`;
                    }).join(", ")}
                  >
                    {SEGMENTS.map((seg) => {
                      const raw = s.breakdown[seg.key];
                      const v = seg.key === "effortTiebreak" ? raw * 0.3 : raw;
                      return v > 0 ? (
                        <span key={seg.key} className={seg.className} style={{ width: `${(v / s.score) * 100}%` }} />
                      ) : null;
                    })}
                  </div>
                </li>
              ))}
            </ol>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {SEGMENTS.map((seg) => (
                <li key={seg.key} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${seg.className}`} />
                  {seg.label}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="mt-6 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
              Start with your own week <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three steps, then it runs itself.</h2>
          </Reveal>
          <div className="mt-14">
            <HowItWorks />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-16 text-primary-foreground sm:px-12 sm:py-20">
              <h2 className="relative max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Tonight&apos;s plan is two minutes away.
              </h2>
              <p className="relative mt-4 max-w-md text-base opacity-80">Free for students. No credit card.</p>
              <Link
                href="/signup"
                className="relative mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-primary-foreground px-5 text-sm font-medium text-primary transition-transform hover:opacity-95 active:scale-[0.98]"
              >
                Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
