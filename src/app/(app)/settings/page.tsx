import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";
import { AvailabilityForm } from "./availability-form";
import { PasswordForm } from "./password-form";
import { DeleteAccount } from "./delete-account";
import { PlanningForm } from "./planning-form";
import { PlanUsage } from "./plan-usage";
import { TutorPreferencesForm } from "./tutor-preferences-form";
import { getUsageSummary } from "@/lib/ai/usage";
import { billingMode } from "@/lib/billing/stripe";
import { readPreferences } from "@/lib/tutor/preferences";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { signOutEverywhere } from "@/server/actions/settings";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();

  const [profile, availability, canvas, usage, subscription] = await Promise.all([
    db.profile.findUnique({
      where: { userId: user.id },
      select: {
        displayName: true,
        grade: true,
        school: true,
        timezone: true,
        goals: true,
        primaryChallenge: true,
        preferredSessionMinutes: true,
        maxDailyMinutes: true,
        tutorInstructions: true,
        tutorPreferences: true,
      },
    }),
    db.studyAvailability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    db.canvasConnection.findUnique({
      where: { userId: user.id },
      select: { status: true, baseUrl: true, lastSyncAt: true },
    }),
    getUsageSummary(user.id),
    db.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeCustomerId: true },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Settings</h1>
      </div>

      <section id="plan" className="scroll-mt-24 space-y-4">
        <h2 className="text-base font-semibold">Plan and usage</h2>
        <PlanUsage
          usage={usage}
          billing={billingMode()}
          subscription={
            subscription
              ? {
                  status: subscription.status,
                  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                  hasCustomer: Boolean(subscription.stripeCustomerId),
                  currentPeriodEnd: subscription.currentPeriodEnd
                    ? formatDateInZone(subscription.currentPeriodEnd, profile?.timezone, { month: "short", day: "numeric", year: "numeric" })
                    : null,
                }
              : null
          }
        />
      </section>

      <section id="tutor" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="text-base font-semibold">How Rushd teaches you</h2>
          <p className="text-sm text-muted-foreground">Tell the tutor how you learn best. You can change or reset this anytime.</p>
        </div>
        <TutorPreferencesForm initial={readPreferences(profile?.tutorPreferences)} instructions={profile?.tutorInstructions ?? ""} />
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Profile</h2>
        <ProfileForm
          initial={{
            displayName: profile?.displayName ?? "",
            grade: profile?.grade ?? null,
            school: profile?.school ?? "",
            timezone: profile?.timezone ?? "America/New_York",
            goals: profile?.goals ?? "",
            primaryChallenge: profile?.primaryChallenge ?? null,
          }}
        />
      </section>

      <section id="availability" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="text-base font-semibold">Study availability</h2>
          <p className="text-sm text-muted-foreground">
            Used to build your plan. Changes take effect immediately.
          </p>
        </div>
        <AvailabilityForm current={availability} />
      </section>

      <section id="planning" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="text-base font-semibold">Planning</h2>
          <p className="text-sm text-muted-foreground">
            How Rushd shapes your study blocks. These are yours to set; Rushd never assumes more capacity than this.
          </p>
        </div>
        <PlanningForm
          initial={{
            preferredSessionMinutes: profile?.preferredSessionMinutes ?? 60,
            maxDailyMinutes: profile?.maxDailyMinutes ?? 240,
          }}
        />
      </section>

      <section id="integrations" className="scroll-mt-24 space-y-3 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Integrations</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div>
            <p className="font-medium">Canvas LMS</p>
            <p className="text-sm text-muted-foreground">
              {canvas
                ? canvas.status === "NEEDS_REAUTH"
                  ? "Needs reconnecting: Canvas stopped accepting the saved token."
                  : `Connected to ${new URL(canvas.baseUrl).hostname}${canvas.lastSyncAt ? "" : ", not synced yet"}.`
                : "Import assignments and due dates from your school's Canvas."}
            </p>
          </div>
          <Link
            href="/integrations/canvas"
            className={buttonVariants({ variant: "outline" })}
          >
            {canvas ? "Manage" : "Connect"}
          </Link>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        <PasswordForm />
        <form action={signOutEverywhere} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Sign out everywhere</p>
            <p className="text-sm text-muted-foreground">Ends every session on every device, including this one.</p>
          </div>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Sign out everywhere
          </button>
        </form>
      </section>

      <section className="space-y-2 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Privacy</h2>
        <p className="text-sm text-muted-foreground">
          Rushd stores your email, academic data (classes, assignments, exams,
          study availability), and basic usage events so planning works and we
          can tell whether Rushd helps. We don&apos;t sell your data. It is
          processed only by the services that run Rushd, listed in the{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section className="space-y-4 border-t border-destructive/30 pt-8">
        <h2 className="text-base font-semibold text-destructive">
          Danger zone
        </h2>
        <DeleteAccount />
      </section>
    </div>
  );
}
