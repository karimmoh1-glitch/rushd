import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated August 2026.</p>

      <div className="prose-content mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <p>
          Rushd is a planning tool for high-school students. This page
          describes, in plain language, what we collect and why. If
          something here ever changes materially, we&apos;ll update this
          page and the date above.
        </p>

        <section>
          <h2 className="font-heading text-lg font-semibold">What we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your email address and a securely hashed password (never stored in plain text).</li>
            <li>
              Profile information you choose to give us: display name, grade,
              school, timezone, and academic goals. School and goals are
              always optional.
            </li>
            <li>
              Academic data you enter: classes, assignments, exams, and study
              availability. This is what the planning engine runs on.
            </li>
            <li>
              Basic product usage events (e.g. &quot;a plan was generated,&quot;
              &quot;an assignment was completed&quot;) so we can tell whether
              Rushd is actually helping. These are tied to your account, not
              sold or shared.
            </li>
            <li>Feedback you submit, including an optional rating and message.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">What we don&apos;t collect</h2>
          <p className="mt-2">
            We don&apos;t run ad trackers. We don&apos;t buy or sell student
            data. We don&apos;t ask for anything beyond what the product
            needs to function — no phone number, no address, no payment
            information (Rushd is free).
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">How it&apos;s used</h2>
          <p className="mt-2">
            Your academic data feeds the planning engine that builds your
            plan. Usage events help us understand which parts of Rushd are
            actually useful. Neither is used for advertising, and neither is
            shared with third parties for their own purposes.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">How it&apos;s protected</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Passwords are hashed with bcrypt — we can&apos;t see your password, and neither can anyone who gets access to the database.</li>
            <li>Sessions are stored in an httpOnly, secure cookie that client-side JavaScript can&apos;t read.</li>
            <li>Every server-side action that reads or changes your data verifies you own it first.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Your control over your data</h2>
          <p className="mt-2">
            You can edit or delete any class, assignment, or exam at any
            time. You can delete your entire account from Settings — this
            permanently removes your account and everything tied to it,
            immediately, no waiting period.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Questions</h2>
          <p className="mt-2">
            Reach out any time — see the{" "}
            <a href="/contact" className="underline underline-offset-4">
              Contact
            </a>{" "}
            page.
          </p>
        </section>
      </div>
    </article>
  );
}
