import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold">Contact</h1>
      <p className="mt-4 text-muted-foreground">
        Questions, bug reports, privacy concerns, or general feedback —
        reach out at{" "}
        <a
          href="mailto:hello@therushd.com"
          className="font-medium text-foreground underline underline-offset-4"
        >
          hello@therushd.com
        </a>
        .
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        If you&apos;re already signed in, there&apos;s also a quick feedback
        form in the app — look for &quot;Feedback&quot; in the sidebar.
      </p>
    </article>
  );
}
