import type { Metadata } from "next";
import { Check, Clock } from "lucide-react";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";
import { InquiryForm } from "./inquiry-form";

export const metadata: Metadata = {
  title: "For schools and educators",
  description: "How Rushd can support students in a classroom or school, what's available today, what's planned, and how to request a pilot.",
  alternates: { canonical: "/schools" },
};

const NOW = [
  "Students connect their own Canvas account (read-only) or add work by hand",
  "Course-grounded tutoring with sources, practice checks, and rubric-based draft feedback",
  "Study planning around each student's deadlines and available time",
  "Each student's data is isolated from everyone else's, and students can delete it anytime",
];
const PLANNED = [
  "School or district accounts with administrator controls",
  "Institution-level Canvas (LTI) installation instead of personal tokens",
  "Teacher views of aggregate, consented class progress",
  "Data processing agreements and a published student-privacy review",
];

export default function SchoolsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <PageViewBeacon path="/schools" />
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Rushd for schools</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Rushd is built for individual students today. We&apos;re looking for a small number of teachers and schools to pilot it
          with real classes and tell us what would make it useful in their setting.
        </p>
      </div>

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Where it could help</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Students practicing between lessons and finding gaps before a test, not after it</li>
            <li>Drafts revised against your actual rubric before they&apos;re submitted</li>
            <li>Students with heavy course loads planning their week realistically</li>
            <li>Tutoring that stays tied to your course materials and won&apos;t write graded work</li>
          </ul>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-1">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Check className="h-4 w-4 text-success" aria-hidden="true" />Available now</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{NOW.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Planned, not built yet</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{PLANNED.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-secondary/40 p-6 text-sm">
        <h2 className="text-lg font-semibold">Security and privacy, as they stand</h2>
        <ul className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
          <li>Canvas access is read-only; tokens are encrypted with AES-256-GCM and never shown again.</li>
          <li>Every query is scoped to the signed-in student; other students&apos; data is never reachable.</li>
          <li>AI requests go to Anthropic&apos;s Claude; content is fenced as data, and usage is capped per student.</li>
          <li>Practice photos aren&apos;t stored. Students can delete conversations, reviews, or their whole account.</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          Rushd has not completed third-party security audits or certifications, and doesn&apos;t yet offer district data
          agreements. We&apos;ll say so plainly until that changes, and we&apos;re glad to walk through the details.
        </p>
      </section>

      <section className="mt-12 grid gap-8 md:grid-cols-[1fr_1.4fr]" aria-labelledby="pilot">
        <div>
          <h2 id="pilot" className="text-2xl font-semibold tracking-tight">Request a pilot</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Tell us about your students and what you&apos;d want Rushd to help with. Karim reads every inquiry personally.
          </p>
        </div>
        <InquiryForm />
      </section>
    </div>
  );
}
