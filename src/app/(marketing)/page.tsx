import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AgentPath } from "@/components/marketing/agent-path";
import { SubjectCycle } from "@/components/marketing/subject-cycle";
import { SignatureLoop } from "@/components/marketing/signature-loop";
import { RankMyWeek } from "@/components/marketing/rank-my-week";
import { AiStatusNote } from "@/components/marketing/ai-status-note";
import { InvitedNote } from "@/components/marketing/invited-note";
import { Suspense } from "react";
import { BONUS_MESSAGES } from "@/lib/referral/constants";
import { GlyphContext, GlyphGap, GlyphNext } from "@/components/marketing/benefit-glyphs";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";
import type { RankRow } from "@/components/marketing/rank-slider";
import { SAMPLE_NOW, SAMPLE_TZ, sampleRanking } from "@/components/marketing/sample-week";
import { explainScore } from "@/lib/planning/explain";
import { pulseOf } from "@/lib/planning/pulse";
import { formatDateInZone, formatTimeInZone } from "@/lib/time/zone";
import { organizationJsonLd } from "@/lib/seo";
import { teamsConfigured } from "@/lib/teams/oauth";
import { aiEnabled } from "@/lib/env";


export const metadata: Metadata = {
  title: { absolute: "Rushd: your personal AI study agent" },
  description:
    "Rushd learns your classes, quizzes you, finds exactly what you don't understand yet, recommends the right videos and practice, and tells you what to study next. Free to start.",
  alternates: { canonical: "/" },
};

// First visit this session, motion allowed: play the brand intro once. The
// class is removed when it's done so navigating back never replays it.
const INTRO = `try{var d=document.documentElement;if(!sessionStorage.getItem("rushd-intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("rushd-intro");sessionStorage.setItem("rushd-intro","1");setTimeout(function(){d.classList.remove("rushd-intro")},2200)}}catch(e){}`;

const BENEFITS = [
  { glyph: GlyphContext, title: "It knows your actual classes", text: "Help comes from your own assignments, notes, and rubrics, not a generic answer from the internet." },
  { glyph: GlyphGap, title: "It finds what you don't understand", text: "It quizzes you and checks photos of your work, then names the exact gap behind the mistakes." },
  { glyph: GlyphNext, title: "It tells you what to do next", text: "The right video, practice, or lesson for that gap, planned around your deadlines." },
];

// Each line restates a commitment from the privacy policy (/privacy); nothing here goes beyond it.
const TRUST = [
  { title: "Read-only connections", text: "Rushd reads Canvas and Teams. It never posts, submits, or messages anyone. Disconnecting deletes the stored token right away." },
  { title: "No ads, no data sales", text: "No ad trackers or third-party analytics. Student data is never bought or sold." },
  { title: "Locked down by default", text: "Passwords are hashed, Canvas tokens are encrypted, and every action checks that the data is yours first." },
  { title: "Yours to delete", text: "Delete any course, assignment, or your whole account from Settings, whenever you want." },
];

function shortDue(date: Date): string {
  return `${formatDateInZone(date, SAMPLE_TZ, { weekday: "short" })} ${formatTimeInZone(date, SAMPLE_TZ)}`;
}

/** The example week, ranked by the real engine, in both orders. */
function rankRows(): RankRow[] {
  const ranked = sampleRanking();
  const byDue = [...ranked].sort((a, b) => a.item.dueAt.getTime() - b.item.dueAt.getTime());
  return ranked.map((s, i) => ({
    id: s.item.id,
    title: s.item.title,
    className: s.item.className,
    color: s.item.classColor,
    dueLabel: shortDue(s.item.dueAt),
    canvasIndex: byDue.findIndex((d) => d.item.id === s.item.id),
    rushdIndex: i,
    pulse: pulseOf(s.score),
    reason: explainScore(s, SAMPLE_NOW, ranked, SAMPLE_TZ)[0] ?? s.item.className,
  }));
}

export default function LandingPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <PageViewBeacon path="/" />
      {aiEnabled && (
        <Suspense fallback={null}>
          <InvitedNote bonus={BONUS_MESSAGES} />
        </Suspense>
      )}

      {/* 1. Hero: what it is in three seconds, why it's better in five. */}
      <section className="overflow-x-clip">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:gap-14 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-20">
          <div>
            <p className="intro-line flex items-center gap-2 text-sm font-medium" style={{ ["--i" as string]: 0 }}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
              Your personal AI study agent
            </p>
            <h1 className="mt-5 text-[3.1rem] leading-[1] tracking-[-0.03em] sm:text-7xl lg:text-[5.25rem]">
              <span className="intro-line intro-text block" style={{ ["--i" as string]: 0.5 }}>Master</span>
              <span className="intro-line intro-text block" style={{ ["--i" as string]: 1.5 }}>
                <SubjectCycle />
              </span>
            </h1>
            <p className="intro-line intro-text mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground" style={{ ["--i" as string]: 2.5 }}>
              Rushd learns your classes, quizzes you, finds exactly what you don&apos;t get yet, and hands you the right video
              or practice to fix it. Then it tells you what&apos;s next.
            </p>
            <div className="intro-line mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ ["--i" as string]: 3.5 }}>
              <Link
                href="/signup"
                className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-primary pl-5 pr-6 text-[15px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-(--ease-out-strong) hover:bg-primary/90 active:scale-[0.97]"
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal transition-transform duration-300 group-hover:scale-125" />
                Start learning free
              </Link>
              <Link href="#loop" className="group inline-flex items-center gap-1.5 text-[15px] font-medium">
                See it work
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
            <AiStatusNote className="intro-line mt-5 max-w-lg" />
            <ul className="intro-line mt-10 hidden flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm sm:flex" style={{ ["--i" as string]: 4.5 }}>
              {["Built from your real classes", "Checks your actual work", "Picks what to watch next"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="intro-line" style={{ ["--i" as string]: 2 }}>
            <RankMyWeek autoplay />
          </div>
        </div>
      </section>

      {/* Honest proof: what it connects to and what it promises. */}
      <section aria-label="Works with your school" className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-muted-foreground">Brings in your work from</span>
            {(teamsConfigured() ? ["Canvas", "Microsoft Teams"] : ["Canvas"]).map((n) => (
              <span key={n} className="font-medium">{n}</span>
            ))}
            <span className="text-muted-foreground">or just type it</span>
          </p>
          <ul className="reveal-stagger flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground lg:flex-nowrap">
            {["Read-only: never posts or submits", "No ads, never sells data", "Delete anytime"].map((t, i) => (
              <li key={t} className="flex items-center gap-2" style={{ ["--i" as string]: i }}>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-signal" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 2. The product in action: the signature moment */}
      <section id="loop" className="scroll-mt-16 overflow-x-clip border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="max-w-xl">
            <h2 className="reveal-rise font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
              Canvas lists everything.
              <br />
              <span className="text-muted-foreground">Rushd ranks it.</span>
            </h2>
            <p className="reveal-rise mt-5 text-lg text-muted-foreground">
              Every item gets a Pulse score: how strongly it needs you right now. Drag the slider, then walk through how Rushd
              gets you from that list to the next step.
            </p>
          </div>
          <div className="mt-16">
            <SignatureLoop rows={rankRows()} />
          </div>
        </div>
      </section>

      {/* 3. Why it's different */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <h2 className="reveal-rise max-w-3xl font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
            A chatbot answers what you ask. <span className="text-muted-foreground">Rushd knows what you need.</span>
          </h2>
          <div className="mt-14 grid items-start gap-14 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <ul className="reveal-stagger grid gap-10">
              {BENEFITS.map((b, i) => (
                <li key={b.title} className="grid grid-cols-[auto_1fr] gap-5" style={{ ["--i" as string]: i }}>
                  <b.glyph />
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{b.title}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <AgentPath />
          </div>
        </div>
      </section>

      {/* 4. Trust: what Rushd does with a student's work */}
      <section aria-labelledby="trust-heading" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <h2 id="trust-heading" className="reveal-rise font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                Your schoolwork stays yours.
              </h2>
              <p className="reveal-rise mt-5 max-w-md text-lg text-muted-foreground">
                Rushd is for students 13 and older, and asks only for what the product needs: no phone number, no address.
              </p>
              <Link href="/privacy" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                Read the privacy policy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <ul className="reveal-stagger grid gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-2">
              {TRUST.map((t, i) => (
                <li key={t.title} className="bg-background p-6" style={{ ["--i" as string]: i }}>
                  <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-signal" />
                  <h3 className="mt-4 font-semibold tracking-tight">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 5. One clear next step */}
      <section className="relative overflow-hidden border-t border-border bg-secondary/50">
        <svg
          aria-hidden="true"
          viewBox="0 0 32 32"
          className="pointer-events-none absolute -right-16 -top-10 hidden h-[26rem] w-[26rem] text-foreground/[0.06] lg:block"
        >
          <path d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="25.5" cy="8.5" r="1.4" fill="var(--signal)" opacity="0.35" />
        </svg>
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
          <h2 className="reveal-rise max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-[-0.02em] sm:text-6xl">
            Start with what&apos;s due this week.
          </h2>
          <p className="reveal-rise mt-5 max-w-md text-lg text-muted-foreground">
            Setup takes about a minute. Free to start; connect Canvas now or later.
          </p>
          <Link
            href="/signup"
            className="group mt-9 inline-flex h-12 items-center gap-2.5 rounded-full bg-primary pl-5 pr-6 text-[15px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-(--ease-out-strong) hover:bg-primary/90 active:scale-[0.97]"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal transition-transform duration-300 group-hover:scale-125" />
            Start learning free
          </Link>
        </div>
      </section>
    </>
  );
}
