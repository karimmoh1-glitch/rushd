import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: { absolute: "Free study tools: rank your homework, plan your finals · Rushd" },
  description: "Free study tools from Rushd. No account needed, and nothing you type leaves your browser.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/rank-my-week",
    name: "Rank my homework",
    text: "Type what's due. Get it ranked by what needs you first, with the reason behind every spot.",
  },
  {
    href: "/tools/exam-study-planner",
    name: "Plan my finals",
    text: "List your tests and how much prep each needs. Get every study session, day by day.",
  },
];

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 lg:pt-16">
      <PageViewBeacon path="/tools" />
      <h1 className="text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">Free study tools.</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        No account, no email. They run in your browser on Rushd&apos;s real planner, and nothing you type is sent anywhere.
      </p>
      <ul className="mt-12 divide-y divide-border border-y border-border">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="group flex items-start justify-between gap-6 py-6">
              <span>
                <span className="font-display text-2xl font-medium tracking-tight">{t.name}</span>
                <span className="mt-1 block text-muted-foreground">{t.text}</span>
              </span>
              <ArrowRight className="mt-2 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
