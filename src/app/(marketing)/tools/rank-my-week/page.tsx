import type { Metadata } from "next";
import Link from "next/link";
import { RankMyWeek } from "@/components/marketing/rank-my-week";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: { absolute: "Rank my homework: a free assignment prioritizer · Rushd" },
  description:
    "Type what's due this week and get it ranked by what needs you first, with a reason for each. Free, no sign-up, and nothing you type leaves your browser.",
  alternates: { canonical: "/tools/rank-my-week" },
};

const FACTORS = [
  ["How soon it's due", "The biggest factor, counted in calendar days in your time zone, so \"tomorrow\" really means tomorrow."],
  ["Tests coming up", "Quizzes and exams in the next week get a boost that grows as the day gets closer, so prep starts before the night before."],
  ["What's already late", "Overdue work jumps up the list until it's done."],
  ["How much it matters", "In the app you can mark work or a whole class as high or low priority. Here, everything counts the same."],
  ["Ties", "When two things are otherwise even, the shorter one goes first, so you get a quick win."],
];

const FAQ = [
  ["How do I write my list?", "One thing per line. Start with the class and a colon if you like (\"Chem: lab report Thursday 2h\"). Days, dates like 10/28, \"tomorrow\", and times like 2h or 40m are understood. Words like quiz, test, or exam mark a test."],
  ["Is what I type private?", "Yes. The ranking runs in your browser; your list isn't sent to Rushd or anyone else. If you share a ranking, the list is inside the link itself."],
  ["What is the Pulse score?", "A number from 1 to 99 for how strongly something needs you right now. 70 and up means start today."],
  ["What does an account add?", "Rushd keeps the list in sync with Canvas or Teams, plans study time around your schedule, re-ranks every day, quizzes you on what you're learning, and picks videos and practice for the parts you don't have yet. Free to start."],
];

export default function RankMyWeekPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 lg:pt-16">
      <PageViewBeacon path="/tools/rank-my-week" />
      <p className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
        Free tool
      </p>
      <h1 className="mt-4 text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">Rank my homework.</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Type what&apos;s due. Rushd&apos;s planner ranks it by what needs you first and tells you why. No sign-up.
      </p>
      <div className="mt-10">
        <RankMyWeek />
      </div>

      <section className="mt-20">
        <h2 className="font-display text-3xl font-medium tracking-tight">What decides the order</h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {FACTORS.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-3xl font-medium tracking-tight">Questions</h2>
        <div className="mt-6 space-y-6">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <h3 className="font-medium">{q}</h3>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20 rounded-2xl border border-border p-6 sm:p-8">
        <h2 className="font-display text-2xl font-medium tracking-tight">Never type the list again.</h2>
        <p className="mt-2 text-muted-foreground">Connect Canvas or Microsoft Teams and Rushd keeps it ranked for you, every day.</p>
        <Link href="/signup" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
          Start free
        </Link>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Rank my homework",
            description: "Ranks your assignments and tests by what needs you first.",
            url: "https://therushd.com/tools/rank-my-week",
            applicationCategory: "EducationalApplication",
            operatingSystem: "Any (web browser)",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            publisher: { "@type": "Organization", name: "Rushd", url: "https://therushd.com" },
          }),
        }}
      />
    </div>
  );
}
