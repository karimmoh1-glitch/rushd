import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { founder } from "@/content/founder";
import { founderJsonLd } from "@/lib/seo";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: { absolute: "Karim Mohamed, Founder of Rushd" },
  description:
    "Karim Mohamed is the founder of Rushd, a personal AI learning system that helps students understand their courses, find knowledge gaps, and know what to study next.",
  alternates: { canonical: "/founder" },
  openGraph: {
    type: "profile",
    title: "Karim Mohamed, Founder of Rushd",
    description: "Why Rushd exists and what it's building: a learning system that helps students know what they understand, what they're missing, and what to study next.",
    url: "/founder",
  },
};

export default function FounderPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageViewBeacon path="/founder" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(founderJsonLd()) }} />
      <header className="flex items-center gap-5">
        {founder.photo ? (
          <Image src={founder.photo} alt={`Photo of ${founder.name}`} width={88} height={88} className="h-22 w-22 rounded-full object-cover" priority />
        ) : (
          <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            KM
          </span>
        )}
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{founder.name}</h1>
          <p className="mt-1 text-lg text-muted-foreground">{founder.role}</p>
        </div>
      </header>

      <div className="mt-12 space-y-12 text-[17px] leading-relaxed">
        {founder.story && (
          <section aria-labelledby="story">
            <h2 id="story" className="text-xl font-semibold tracking-tight">Why I started Rushd</h2>
            {founder.story.map((p) => <p key={p} className="mt-3">{p}</p>)}
          </section>
        )}

        <section aria-labelledby="problem">
          <h2 id="problem" className="text-xl font-semibold tracking-tight">The problem</h2>
          <p className="mt-3">
            Students get work from everywhere at once: several courses, each with its own deadlines, materials, and expectations.
            The hard part usually isn&apos;t finding information. It&apos;s knowing what you actually understand, what you&apos;re
            missing, and what deserves the next hour. Most feedback arrives after the grade, when it&apos;s too late to use.
          </p>
        </section>

        <section aria-labelledby="building">
          <h2 id="building" className="text-xl font-semibold tracking-tight">What Rushd is building</h2>
          <p className="mt-3">
            Rushd is a personal learning system built around one loop: learn, practice, check your work, find the gaps, get
            targeted help, and check again. It connects to a student&apos;s real coursework, tutors from their own class
            materials, gives feedback against their teacher&apos;s actual rubric, keeps a record of what they&apos;ve shown they
            know, and plans study time around their deadlines.
          </p>
        </section>

        <section aria-labelledby="approach">
          <h2 id="approach" className="text-xl font-semibold tracking-tight">How Rushd approaches AI in learning</h2>
          <ul className="mt-3 space-y-3">
            <li><span className="font-medium">Grounded in your course.</span> Answers cite the class materials they came from, and nothing is invented to fill a gap: no made-up rubrics, sources, or links.</li>
            <li><span className="font-medium">Honest about uncertainty.</span> Estimates come with ranges and confidence. One check is a snapshot; mastery is built from repeated evidence.</li>
            <li><span className="font-medium">Help that teaches.</span> The tutor explains, asks, and gives feedback. It doesn&apos;t do graded work for students.</li>
            <li><span className="font-medium">Trust first.</span> Student data isn&apos;t sold, Canvas access is read-only, and students can see and delete what Rushd keeps.</li>
          </ul>
        </section>

        <section aria-labelledby="name">
          <h2 id="name" className="text-xl font-semibold tracking-tight">The name</h2>
          <p className="mt-3">
            <span lang="ar" dir="rtl">رُشد</span> (rushd) is Arabic for sound judgment and right guidance: knowing which path to
            take. That&apos;s the aim for every student who uses it.
          </p>
        </section>

        <section aria-labelledby="mission">
          <h2 id="mission" className="text-xl font-semibold tracking-tight">The mission</h2>
          <p className="mt-3">
            Help every student know what they understand, what they&apos;re missing, and what to study next, and earn the trust of
            the students, families, and schools who rely on it.
          </p>
        </section>

        <section aria-labelledby="contact" className="rounded-xl border border-border bg-card p-6 text-base">
          <h2 id="contact" className="text-xl font-semibold tracking-tight">Get in touch</h2>
          <ul className="mt-3 space-y-2">
            <li><span className="font-medium">Students:</span> try Rushd and send feedback from the app; it goes straight to Karim.</li>
            <li><span className="font-medium">Educators and schools:</span> interested in a pilot? <Link href="/schools" className="text-primary underline-offset-4 hover:underline">Tell us about your school</Link>.</li>
            <li><span className="font-medium">Everyone else:</span> <Link href="/contact" className="text-primary underline-offset-4 hover:underline">contact Rushd</Link>.</li>
          </ul>
          {founder.links.length > 0 && (
            <p className="mt-4 flex flex-wrap gap-4 text-sm">
              {founder.links.map((l) => <a key={l.href} href={l.href} rel="me noopener noreferrer" className="underline underline-offset-4">{l.label}</a>)}
            </p>
          )}
          <Link href="/signup" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Start learning free <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </article>
  );
}
