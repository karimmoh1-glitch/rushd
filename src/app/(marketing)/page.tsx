import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AgentPath } from "@/components/marketing/agent-path";
import { SubjectCycle } from "@/components/marketing/subject-cycle";
import { SignatureLoop } from "@/components/marketing/signature-loop";
import { GlyphContext, GlyphGap, GlyphNext } from "@/components/marketing/benefit-glyphs";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";
import { PLANS } from "@/lib/billing/plans";
import { organizationJsonLd } from "@/lib/seo";

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

export default function LandingPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <PageViewBeacon path="/" />

      {/* 1. Hero: what it is in three seconds, why it's better in five. */}
      <section className="overflow-x-clip">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-20">
          <div>
            <p className="intro-line flex items-center gap-2 text-sm font-medium" style={{ ["--i" as string]: 0 }}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
              Your personal AI study agent
            </p>
            <h1 className="mt-5 text-[3.1rem] leading-[1] tracking-[-0.03em] sm:text-7xl lg:text-[5.25rem]">
              <span className="intro-line block" style={{ ["--i" as string]: 0.5 }}>Master</span>
              <span className="intro-line block" style={{ ["--i" as string]: 1.5 }}>
                <SubjectCycle />
              </span>
            </h1>
            <p className="intro-line mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground" style={{ ["--i" as string]: 2.5 }}>
              Rushd learns your classes, quizzes you, finds exactly what you don&apos;t get yet, and hands you the right video
              or practice to fix it. Then it tells you what&apos;s next.
            </p>
            <div className="intro-line mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ ["--i" as string]: 3.5 }}>
              <Link
                href="/signup"
                className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-primary pl-5 pr-6 text-[15px] font-medium text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary/90 active:translate-y-px"
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal transition-transform duration-300 group-hover:scale-125" />
                Start learning free
              </Link>
              <Link href="#loop" className="group inline-flex items-center gap-1.5 text-[15px] font-medium">
                See it work
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
            <ul className="intro-line mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm" style={{ ["--i" as string]: 4.5 }}>
              {["Built from your real classes", "Checks your actual work", "Picks what to watch next"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <AgentPath />
        </div>
      </section>

      {/* 2. The product in action: the signature moment */}
      <section id="loop" className="scroll-mt-16 overflow-x-clip border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="max-w-xl">
            <h2 className="reveal-rise font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
              Scattered coursework in.
              <br />
              <span className="text-muted-foreground">One clear next step out.</span>
            </h2>
            <p className="reveal-rise mt-5 text-lg text-muted-foreground">
              One example week: Rushd sorts what your classes posted, quizzes you, finds the gap, and picks what to watch.
            </p>
          </div>
          <div className="mt-16">
            <SignatureLoop />
          </div>
        </div>
      </section>

      {/* 3. Why it's different */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <h2 className="reveal-rise max-w-3xl font-display text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
            A chatbot answers what you ask. <span className="text-muted-foreground">Rushd knows what you need.</span>
          </h2>
          <ul className="reveal-stagger mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {BENEFITS.map((b, i) => (
              <li key={b.title} style={{ ["--i" as string]: i }}>
                <b.glyph />
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{b.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Conversion */}
      <section className="border-t border-border bg-secondary/50">
        <div className="mx-auto grid max-w-6xl items-end gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8">
          <div>
            <h2 className="reveal-rise font-display text-4xl font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">
              Start with what&apos;s due this week.
            </h2>
            <p className="reveal-rise mt-4 max-w-md text-lg text-muted-foreground">Setup takes about a minute. Connect Canvas now or later.</p>
            <Link
              href="/signup"
              className="group mt-8 inline-flex h-12 items-center gap-2.5 rounded-full bg-primary pl-5 pr-6 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal transition-transform duration-300 group-hover:scale-125" />
              Start learning free
            </Link>
          </div>
          <div>
            <ul className="divide-y divide-border border-y border-border">
              {[PLANS.FREE, PLANS.PLUS, PLANS.PRO].map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-4 py-3.5">
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{p.tagline}</span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">{p.priceMonthlyUsd ? `$${p.priceMonthlyUsd}/mo` : "Free"}</span>
                </li>
              ))}
            </ul>
            <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
              Compare plans <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
