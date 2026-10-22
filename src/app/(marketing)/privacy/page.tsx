import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated October 2026.</p>

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
          <h2 className="font-heading text-lg font-semibold">If you connect Canvas</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Connecting is optional. You give Rushd your school&apos;s Canvas address and a personal access
              token you create in Canvas.
            </li>
            <li>
              The token is encrypted (AES-256-GCM) before it&apos;s stored, is only ever used by Rushd&apos;s
              server, is never shown back to you or anyone else, and is never written to logs.
            </li>
            <li>
              Rushd stores only what planning needs: your name on Canvas, your active courses, and for the
              courses you choose, each assignment&apos;s title, due date, points, link, and whether and when
              you submitted it. Canvas sends your submission record along with each assignment; Rushd uses only
              the submitted status and never stores grades or scores. It doesn&apos;t access messages, files, or
              other students&apos; information.
            </li>
            <li>
              Rushd never writes anything to Canvas. Syncing happens when you ask for it.
            </li>
            <li>
              Disconnecting deletes the stored token immediately. You choose whether imported assignments are
              kept or removed. To fully revoke access, also delete the token in Canvas under Account, Settings,
              Approved Integrations.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Screenshot import</h2>
          <p className="mt-2">
            If you upload a screenshot of your calendar, it&apos;s sent to our AI provider (Anthropic) to read
            the assignments in it, then discarded. Rushd doesn&apos;t store the image, and you review everything
            before it&apos;s saved.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">What we don&apos;t collect</h2>
          <p className="mt-2">
            We don&apos;t run ad trackers. We don&apos;t buy or sell student
            data. We don&apos;t ask for anything beyond what the product
            needs to function: no phone number, no address, no payment
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
            <li>Passwords are hashed with bcrypt. We can&apos;t see your password, and neither can anyone who gets access to the database.</li>
            <li>Canvas tokens are encrypted with a key that lives outside the database, and each one only decrypts for the account that saved it.</li>
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
            Reach out any time. See the{" "}
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
