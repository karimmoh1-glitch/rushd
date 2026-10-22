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
              Academic data you enter: courses, assignments, exams, and study
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
              the submitted status and never stores grades or scores. It doesn&apos;t access messages, file
              contents, or other students&apos; information.
            </li>
            <li>
              If you sync a course&apos;s content, Rushd also stores what your teacher published for students in
              that course: module names and item titles, page text, assignment descriptions and rubrics, and
              announcements from the last four months. It&apos;s replaced on each sync and deleted with your
              account or course.
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
          <h2 className="font-heading text-lg font-semibold">If you connect Microsoft Teams</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Connecting is optional and uses Microsoft sign-in; Rushd never sees your Microsoft password. Rushd asks
              only for read access to your profile name, your classes, and your assignments.
            </li>
            <li>
              Rushd stores an encrypted (AES-256-GCM) Microsoft refresh token, your class names, and for the classes you
              choose, each assignment&apos;s title, due date, points, link, and whether you turned it in. Not grades, files,
              chats, or other students&apos; information.
            </li>
            <li>Rushd never writes to Teams. Disconnecting deletes the stored token immediately.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">If you connect a Canvas calendar feed</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Your Canvas calendar feed link is private to you, so Rushd stores it encrypted (AES-256-GCM), like a password.
            </li>
            <li>
              Rushd reads only the assignment entries in it (title, course name, due date, link) and ignores other calendar
              events. Disconnecting deletes the stored link immediately.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">&ldquo;Rank my week&rdquo; on the homepage</h2>
          <p className="mt-2">
            The ranking runs in your browser; what you type isn&apos;t sent to Rushd. If you choose to save it before signing
            up, it stays in your browser until you add it to your account or dismiss it. A shared ranking link carries the
            list inside the link itself.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Email</h2>
          <p className="mt-2">
            Rushd emails you for password resets and, unless you turn them off, a Sunday summary of your week and a reminder
            when a study streak is about to end. Emails are delivered by Resend. Every study email has a one-click
            unsubscribe, and Settings has the same switch.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Invites</h2>
          <p className="mt-2">
            If you join through a friend&apos;s invite link, Rushd records who invited you so you both get the bonus. The
            friend sees only how many people joined and studied, never who.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Screenshot import</h2>
          <p className="mt-2">
            If you upload a screenshot of your calendar, it&apos;s sent to our AI provider (Anthropic) to read
            the assignments in it, then discarded. Rushd doesn&apos;t store the image, and you review everything
            before it&apos;s saved.
          </p>
        </section>

        <section id="ai" className="scroll-mt-24">
          <h2 className="font-heading text-lg font-semibold">Tutor, practice checks, and draft feedback</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              These features use Anthropic&apos;s Claude models. When you use them, your message, the course content
              Rushd retrieves to answer it, any draft you paste, practice photos or typed answers, and the tutor
              preferences you set in Settings are sent to Anthropic to generate the reply.
              Anthropic processes this data to provide the service; see Anthropic&apos;s own privacy terms for how it
              handles API data.
            </li>
            <li>
              Rushd saves your tutor conversations and the drafts you submit for feedback so you can return to them
              and compare revisions. Practice photos are not saved; only each check&apos;s results and the topic
              evidence behind your mastery estimates are. You can delete any conversation, review, or check.
            </li>
            <li>
              Practice checks can include YouTube video suggestions. When configured, Rushd asks YouTube&apos;s API
              for videos on the concept (sending only the concept name, never anything about you).
            </li>
            <li>
              Usage records for these features contain counts only (for example, tokens used), never the content of
              your messages or drafts.
            </li>
            <li>
              Feedback scores are an AI estimate against your teacher&apos;s published rubric, shown as ranges. Your
              teacher grades your work.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">What we don&apos;t collect</h2>
          <p className="mt-2">
            We don&apos;t run ad trackers or third-party analytics. We don&apos;t
            buy or sell student data. We don&apos;t ask for anything beyond what
            the product needs: no phone number and no address. Rushd is for
            people 13 and older.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Payments</h2>
          <p className="mt-2">
            If you buy a plan, Stripe processes the payment. Rushd never sees
            or stores your card number; it stores your Stripe customer id,
            your plan, and its status so it can apply your allowances.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Usage measurement</h2>
          <p className="mt-2">
            Public pages are counted without cookies or identifiers (just the
            page and the day). Inside the app, Rushd records product events
            (for example, that a practice check was completed) and the amount
            of AI each account uses, so it can enforce plan limits and see
            whether Rushd helps. These records never contain your messages,
            drafts, photos, or Canvas credentials.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">How it&apos;s used</h2>
          <p className="mt-2">
            Your academic data feeds the planning engine that builds your
            plan. Usage events help us understand which parts of Rushd are
            actually useful. Neither is used for advertising, and neither is
            shared with third parties for their own purposes. Data is
            processed only by the services that run Rushd: hosting (Vercel),
            the database (Neon), email delivery (Resend), and, for the AI features above, Anthropic.
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
            You can edit or delete any course, assignment, or exam at any
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
