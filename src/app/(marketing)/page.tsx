import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Camera, Check, ClipboardCheck, Lock, MessageSquareText, Plug, Route, Target } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { WorkflowPreview } from "@/components/marketing/workflow-preview";
import { ScheduleDemo } from "@/components/marketing/schedule-demo";
import { PricingTable } from "@/components/marketing/pricing-table";
import { DownloadButtons } from "@/components/marketing/download-buttons";
import { FAQ, faqJsonLd } from "@/components/marketing/faq";
import { organizationJsonLd } from "@/lib/seo";
import { billingConfigured } from "@/lib/billing/stripe";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: { absolute: "Rushd: your personal AI learning system" },
  description:
    "Rushd connects to your coursework, tutors you from your own course materials, checks your work against your real rubrics, tracks what you've mastered, and plans what to study next. Free to start.",
  alternates: { canonical: "/" },
};

const STEPS = [
  { icon: Plug, title: "Connect", text: "Canvas, or add work yourself" },
  { icon: MessageSquareText, title: "Learn", text: "A tutor that knows your course" },
  { icon: Camera, title: "Check your work", text: "Photo or typed answers" },
  { icon: Target, title: "See the gaps", text: "What you know, what's missing" },
  { icon: Route, title: "Get a plan", text: "Study blocks around your deadlines" },
  { icon: ClipboardCheck, title: "Track mastery", text: "Progress built from evidence" },
];

export default function LandingPage() {
  return (
    <>
      <PageViewBeacon path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1fr_1.08fr] lg:gap-14 lg:px-8 lg:pb-16 lg:pt-16">
          <div>
            <p className="text-sm font-medium text-primary">For high school and college students</p>
            <h1 className="mt-3 text-[2.4rem] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-5xl lg:text-[3.4rem]">
              Your personal AI learning system.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Rushd connects to your coursework, tutors you from your own class materials, checks your work against your real
              rubrics, shows what you&apos;ve mastered, and plans what to study next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px"
              >
                Start learning free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link href="#how" className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-5 text-sm font-medium transition-colors hover:bg-muted">
                See how it works
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Free plan. No credit card. Works with Canvas or without it.</p>
          </div>
          <div>
            <WorkflowPreview />
          </div>
        </div>
        <div className="border-t border-border bg-secondary/40">
          <ol className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:grid-cols-6 lg:px-8" aria-label="How Rushd works">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <s.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {s.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The loop */}
      <section id="how" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn, check, fix the gaps. Repeat.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Most study tools stop at one step. Rushd connects them: what you practice tells the tutor where to focus, and what
              you&apos;ve mastered shapes the next study plan.
            </p>
          </Reveal>

          <div className="mt-14 space-y-20">
            <Reveal className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary"><Camera className="h-4 w-4" aria-hidden="true" />Find your knowledge gaps</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Snap a photo of your work. Know what to fix.</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Rushd checks each answer, including your reasoning, and gives a short result: an estimate with an honest range,
                  your strongest skill, the gap that matters most, and the prerequisite behind it. Then practice questions and a
                  link straight into tutoring.
                </p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {["Handwritten work, worksheets, diagrams, or typed answers", "Asks for a clearer photo instead of guessing", "One check never decides your level; repeated evidence does"].map((t) => (
                    <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="surface rounded-xl p-5">
                <p className="text-xs text-muted-foreground">Example result · Chain rule</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">55–75%</p>
                <p className="text-xs text-muted-foreground">Estimate from 5 answers · medium confidence · not a grade</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><p className="text-sm font-semibold">Strongest skill</p><p className="text-sm text-muted-foreground">Power rule with polynomials</p></div>
                  <div><p className="text-sm font-semibold">Work on</p><p className="text-sm text-muted-foreground">Chain rule with trig, built on derivatives of sin and cos</p></div>
                </div>
                <ol className="mt-4 list-decimal space-y-1 border-t border-border pt-4 pl-5 text-sm">
                  <li>Redo Q3, writing the inner derivative separately</li>
                  <li>Three targeted problems on composite trig functions</li>
                  <li>Review with the tutor, starting from a diagnostic question</li>
                </ol>
              </div>
            </Reveal>

            <Reveal className="grid items-center gap-10 lg:grid-cols-2">
              <div className="lg:order-2">
                <p className="flex items-center gap-2 text-sm font-medium text-primary"><BookOpen className="h-4 w-4" aria-hidden="true" />Your courses, organized</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Canvas in, everything in one place.</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Connect Canvas and Rushd brings in your courses, deadlines, modules, pages, assignment instructions, rubrics, and
                  announcements, read-only. It shows when each course last synced and says plainly when a school hides something
                  from students. No Canvas? Add work by hand or from a screenshot.
                </p>
              </div>
              <div className="surface rounded-xl p-5 lg:order-1">
                <p className="text-xs text-muted-foreground">Example course · AP Chemistry · synced from Canvas</p>
                <p className="mt-3 text-sm font-semibold">Unit 3: Stoichiometry</p>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {[["Page", "Mole concept notes"], ["Assignment", "Titration lab report · rubric"], ["Quiz", "Limiting reagents check"], ["File", "Lab safety sheet"]].map(([k, t]) => (
                    <li key={t} className="flex gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">{k}</span>{t}</li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Announcement · “Lab moved to Thursday. Bring goggles.”</p>
              </div>
            </Reveal>

            <Reveal className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary"><MessageSquareText className="h-4 w-4" aria-hidden="true" />Tutoring and feedback</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">A tutor that cites your course, and a reviewer that uses your rubric.</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  The tutor answers from your own class materials and shows its sources. It explains, quizzes, and plans; it
                  won&apos;t write graded work for you. Paste a draft and get feedback criterion by criterion against your
                  teacher&apos;s actual rubric, with quotes from your draft and a score range labeled as an estimate.
                </p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {["Tell it how you learn: hints first, worked examples, harder questions", "No rubric published? It says so instead of inventing one", "Read-only: it can't submit, message teachers, or change Canvas"].map((t) => (
                    <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="surface space-y-3 rounded-xl p-5">
                <p className="text-xs text-muted-foreground">Example review · Titration lab report</p>
                {[["Procedure", "8–10", "10", "Steps are reproducible; note the indicator you used."], ["Error analysis", "2–3", "5", "You name one error source. Quantify its effect on concentration."]].map(([c, r, p, note]) => (
                  <div key={c} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between text-sm"><span className="font-medium">{c}</span><span className="font-mono tabular-nums">{r} / {p}</span></div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">AI estimate against the teacher&apos;s rubric · your teacher grades</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Live planner */}
      <section id="planner" className="scroll-mt-16 border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-medium text-primary"><Route className="h-4 w-4" aria-hidden="true" />Study plan</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">A plan that fits the time you actually have.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              This is Rushd&apos;s real scheduler running in your browser on an example week. Change when you&apos;re free or add a
              surprise assignment and watch every block move. When work won&apos;t fit before a deadline, it tells you.
            </p>
          </Reveal>
          <Reveal className="mt-10">
            <ScheduleDemo />
          </Reveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <Reveal>
            <p className="flex items-center gap-2 text-sm font-medium text-primary"><Lock className="h-4 w-4" aria-hidden="true" />Privacy</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Your coursework stays yours.</h2>
            <p className="mt-4 text-muted-foreground">Plain facts about how Rushd handles student data.</p>
            <Link href="/privacy" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Read the privacy policy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal>
            <dl className="grid gap-6 sm:grid-cols-2">
              {[
                ["No ads, no data sales", "Rushd doesn't sell student data or run ad trackers."],
                ["Canvas is read-only", "Your token is encrypted (AES-256-GCM), never shown again, and deleted when you disconnect."],
                ["Photos aren't kept", "Practice photos are read and discarded; only the results are saved."],
                ["Clear about AI", "Tutor messages, drafts, and photos go to Anthropic's Claude to generate answers. You can delete conversations and reviews."],
                ["Delete everything", "Deleting your account removes your data immediately."],
                ["Grades stay out", "Rushd doesn't read or store Canvas grades."],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="text-sm font-semibold">{t}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{d}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Start free. Upgrade if you use it every week.</h2>
            <p className="mt-4 text-muted-foreground">Planning and Canvas sync are free. Paid plans add more tutoring, checks, and reviews.</p>
          </Reveal>
          <Reveal className="mt-10">
            <PricingTable compact billingOpen={billingConfigured()} />
          </Reveal>
        </div>
      </section>

      {/* Desktop + founder */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight">On your desktop, too.</h2>
            <p className="mt-3 text-muted-foreground">
              Rushd for Mac and Windows opens your account in its own window, with links to other sites going to your browser.
              It needs an internet connection.
            </p>
            <div className="mt-5">
              <DownloadButtons />
            </div>
          </Reveal>
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight">Who&apos;s building this</h2>
            <p className="mt-3 text-muted-foreground">
              Rushd is built by Karim Mohamed. The goal is simple to say and hard to do well: help every student know what they
              understand, what they&apos;re missing, and what to study next.
            </p>
            <Link href="/founder" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Read why Rushd exists <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <FAQ />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-foreground px-6 py-14 text-background sm:px-12">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Know what to study next.</h2>
            <p className="mt-3 max-w-md opacity-75">Setup takes about a minute. Connect Canvas now or later.</p>
            <Link href="/signup" className="mt-7 inline-flex h-11 items-center gap-2 rounded-lg bg-background px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-90">
              Start learning free <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
