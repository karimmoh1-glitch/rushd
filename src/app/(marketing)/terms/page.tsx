import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated August 2026.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-heading text-lg font-semibold">The basics</h2>
          <p className="mt-2">
            Rushd is a free academic planning tool. By creating an account,
            you agree to these terms. If you&apos;re under 18, please make
            sure a parent or guardian is comfortable with you using it.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Your account</h2>
          <p className="mt-2">
            You&apos;re responsible for keeping your password private and for
            what happens under your account. Use accurate information when
            you sign up. One account per person, please.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Acceptable use</h2>
          <p className="mt-2">
            Rushd is meant to help you plan your own academic work. Please
            don&apos;t use it to store or share content unrelated to that, to
            interfere with the service, or to try to access another
            student&apos;s data.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">The planning engine</h2>
          <p className="mt-2">
            Rushd&apos;s suggestions are based on what you enter — due dates,
            effort estimates, and priorities you provide. It&apos;s a
            planning aid, not a guarantee: you&apos;re responsible for
            confirming deadlines and requirements with your teachers and
            school.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">No warranty</h2>
          <p className="mt-2">
            Rushd is provided as-is, free of charge, without warranties of
            any kind. We do our best to keep it reliable and accurate, but we
            can&apos;t guarantee it will be error-free or available at all
            times.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Ending your account</h2>
          <p className="mt-2">
            You can delete your account at any time from Settings. We may
            suspend or remove accounts that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Changes</h2>
          <p className="mt-2">
            If these terms change materially, we&apos;ll update the date at
            the top of this page.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold">Questions</h2>
          <p className="mt-2">
            See the{" "}
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
