import Link from "next/link";
import { CheckCircle2, ShieldCheck, KeyRound, Trash2 } from "lucide-react";

const STEPS = [
  {
    title: "Add your classes",
    body: "Name, teacher, period, color. Takes about a minute.",
  },
  {
    title: "Add assignments and exams",
    body: "Due dates, estimated effort, priority. Or use quick-add and type it in plain language.",
  },
  {
    title: "Set your study availability",
    body: "Tell Rushd when you're usually free to work.",
  },
  {
    title: "Get a prioritized plan",
    body: "Rushd scores everything by urgency, importance, and exam proximity, then schedules it into your available time.",
  },
  {
    title: "Work the plan, and it adapts",
    body: "Complete something, miss something, add something new — the plan updates.",
  },
];

const FEATURES = [
  {
    title: "A real planning engine",
    body: "Not a to-do list. Rushd scores every assignment and exam by urgency, effort, priority, and how close it is, then schedules your available time around what matters most. The logic is documented, not a black box.",
  },
  {
    title: "Adapts as things change",
    body: "Finish something, miss something, add something new — your plan updates to match, instead of going stale the moment reality doesn't match the schedule.",
  },
  {
    title: "Quick add, in your own words",
    body: 'Type "AP Chem lab due Friday, ~2 hours" and Rushd turns it into a structured assignment. You always see the parsed result before it\'s saved.',
  },
  {
    title: "Built for one thing",
    body: "No feed, no chat, no gamification. Rushd exists to answer one question: what should you work on right now.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Turn academic chaos into a clear plan
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-balance">
          Rushd tracks your classes, assignments, and exams, then tells you
          exactly what to work on right now — and keeps that plan current as
          things change.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started — it&apos;s free
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-muted"
          >
            See how it works
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold">
            Your work is scattered. Your time isn&apos;t.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Assignments live in one app, exams in a calendar, deadlines in
            your head. None of it accounts for how much time you actually
            have. A planner that just lists everything you owe doesn&apos;t
            help — you still have to figure out what to do first, and when.
            Rushd does that part.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="font-heading text-2xl font-semibold">How Rushd works</h2>
        <ol className="mt-8 space-y-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary font-heading text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Example dashboard */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold">What you&apos;ll see</h2>
          <p className="mt-3 text-muted-foreground">
            An illustrative example — every student&apos;s plan looks
            different, built entirely from their own classes and deadlines.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <p className="font-heading text-lg font-semibold">Today&apos;s plan</p>
            </div>
            <div className="divide-y divide-border">
              {[
                {
                  title: "Lab report: acid-base titration",
                  meta: "AP Chemistry · 45 min",
                  reason: "Overdue — do this first",
                  tone: "text-destructive",
                },
                {
                  title: "Unit 4 test prep",
                  meta: "AP Chemistry · 1h 30m",
                  reason: "Exam coming up soon",
                  tone: "text-warning",
                },
                {
                  title: "Read chapter 12",
                  meta: "US History · 30 min",
                  reason: "Due soon",
                  tone: "text-muted-foreground",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3 px-5 py-4">
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.meta}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${item.tone}`}>
                    {item.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core features */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="font-heading text-2xl font-semibold">Core features</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy / security principles */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold">
            Privacy is a constraint, not a policy page
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="flex gap-3">
              <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Passwords are hashed, never stored in plain text.
              </p>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                We collect only what the planning engine needs — no ad
                tracking, no data sold to third parties.
              </p>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Every server action verifies you own the data before it lets
                you touch it.
              </p>
            </div>
            <div className="flex gap-3">
              <Trash2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Delete your account anytime — it removes your data
                permanently, immediately.
              </p>
            </div>
          </div>
          <Link
            href="/privacy"
            className="mt-6 inline-block text-sm font-medium text-primary underline underline-offset-4"
          >
            Read the full privacy policy
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-heading text-2xl font-semibold">
          Stop guessing what to work on next
        </h2>
        <p className="mt-3 text-muted-foreground">
          Free for students. No credit card, ever.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Get started
        </Link>
      </section>
    </>
  );
}
