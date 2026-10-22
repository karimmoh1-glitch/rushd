import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "What's new",
  description: "Everything that changed in Rushd, newest first.",
  alternates: { canonical: "/changelog" },
};

// Student-facing changes only, newest first. Each entry is something students
// can use on therushd.com today; nothing here is planned work. Features that are
// built but waiting on a key (email, Microsoft Teams, the AI tutor and draft
// feedback, and the invite bonus, which is paid in tutor messages) get an
// entry on the day they're switched on.
const ENTRIES: { date: string; items: [string, string][] }[] = [
  {
    date: "October 22, 2026",
    items: [
      ["Rank my homework, free", "Type your week on the homepage or at /tools/rank-my-week and get it ranked by Pulse, no account. Tap any item to see what went into its score."],
      ["Plan my finals", "List your tests and how much prep each needs; get every study session, day by day."],
      ["Connect Canvas without a token", "If your school turned off Canvas access tokens, connect with your Canvas calendar feed instead."],
      ["Study streaks", "Today shows your streak as the Rushd path. Every 7 days in a row saves a rest day. Share a streak card with friends."],
      ["Always up to date", "Canvas and calendar feeds re-sync every day on their own."],
      ["Start here", "New accounts can type their week right on Today; Rushd makes the classes and ranks everything."],
    ],
  },
  {
    date: "October 21, 2026",
    items: [
      ["Pulse", "Every assignment and test gets a Pulse score from 1 to 99: how strongly it needs you right now."],
      ["A new look", "A darker graphite theme, the Rushd path, and a new app icon on every platform."],
      ["Desktop apps", "Rushd for Mac and Windows."],
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 lg:pt-16">
      <h1 className="text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">What&apos;s new.</h1>
      <p className="mt-4 text-lg text-muted-foreground">Everything that changed in Rushd, newest first.</p>
      <ol className="mt-14 space-y-14">
        {ENTRIES.map((e) => (
          <li key={e.date} className="grid gap-4 sm:grid-cols-[11rem_1fr]">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:pt-1">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
              {e.date}
            </h2>
            <ul className="space-y-5">
              {e.items.map(([t, d]) => (
                <li key={t}>
                  <h3 className="font-medium">{t}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{d}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-16 text-sm text-muted-foreground">
        Have an idea or found a bug? Use Feedback in the app, or <Link href="/contact" className="underline underline-offset-4">contact us</Link>.
      </p>
    </div>
  );
}
