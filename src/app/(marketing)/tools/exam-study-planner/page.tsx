import type { Metadata } from "next";
import Link from "next/link";
import { ExamPlanner } from "@/components/marketing/exam-planner";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: { absolute: "Exam study planner: a free finals schedule maker · Rushd" },
  description:
    "List your exams and how much prep each needs. Get a day-by-day study schedule that fits your free time and starts early enough. Free, no sign-up, runs in your browser.",
  alternates: { canonical: "/tools/exam-study-planner" },
};

const HOW = [
  ["Prep starts early and finishes early", "Study for each test starts up to two weeks before it, in sessions the length you pick, and is done ahead of time, so the last days are for review instead of cramming."],
  ["Sooner tests go first", "When two tests compete for the same evening, the closer one gets it."],
  ["It tells you when it doesn't fit", "If there isn't enough free time before a test, you'll see how many hours are missing, so you can add time or start sooner."],
];

export default function ExamPlannerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 lg:pt-16">
      <PageViewBeacon path="/tools/exam-study-planner" />
      <p className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
        Free tool
      </p>
      <h1 className="mt-4 text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">Plan my finals.</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        List your tests and how much prep each needs. Rushd&apos;s scheduler lays out every study session before each one. No sign-up.
      </p>
      <div className="mt-10">
        <ExamPlanner />
      </div>

      <section className="mt-20">
        <h2 className="font-display text-3xl font-medium tracking-tight">How the plan is made</h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {HOW.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[16rem_1fr] sm:gap-6">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">
          Writing dates: &ldquo;Dec 14&rdquo;, &ldquo;12/14&rdquo;, a weekday, or &ldquo;tomorrow&rdquo;. Prep time: &ldquo;6h&rdquo; or
          &ldquo;90m&rdquo;. Also see <Link href="/tools/rank-my-week" className="underline underline-offset-4">Rank my homework</Link>.
        </p>
      </section>
    </div>
  );
}
