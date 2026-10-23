import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, School } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl">Contact</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Questions, bug reports, privacy concerns, or general feedback.
      </p>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        <li className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
          <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">Email</h2>
          <p className="mt-1 text-sm text-muted-foreground">For anything at all.</p>
          <a href="mailto:hello@therushd.com" className="mt-3 inline-block text-sm font-medium text-foreground underline underline-offset-4">
            hello@therushd.com
          </a>
        </li>
        <li className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
          <MessageSquare className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">In the app</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in? Choose &quot;Feedback&quot; in the sidebar to send a note without leaving what you&apos;re doing.
          </p>
          <Link href="/login" className="mt-3 inline-block text-sm font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </li>
        <li className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
          <School className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">Schools and teachers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Interested in a pilot with your students? Tell us about your school.</p>
          <Link href="/schools" className="mt-3 inline-block text-sm font-medium text-foreground underline underline-offset-4">
            Rushd for schools
          </Link>
        </li>
      </ul>
    </article>
  );
}
