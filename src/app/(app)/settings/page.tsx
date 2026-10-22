import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";
import { AvailabilityForm } from "./availability-form";
import { PasswordForm } from "./password-form";
import { DeleteAccount } from "./delete-account";
import { PlanningForm } from "./planning-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();

  const [profile, availability, canvas] = await Promise.all([
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
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Profile</h2>
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
          <h2 className="font-heading text-lg font-semibold">Study availability</h2>
          <p className="text-sm text-muted-foreground">
            Used to build your plan. Changes take effect immediately.
          </p>
        </div>
        <AvailabilityForm current={availability} />
      </section>

      <section id="planning" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="font-heading text-lg font-semibold">Planning</h2>
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
        <h2 className="font-heading text-lg font-semibold">Integrations</h2>
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
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {canvas ? "Manage" : "Connect"}
          </Link>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        <PasswordForm />
      </section>

      <section className="space-y-2 border-t border-border pt-8">
        <h2 className="font-heading text-lg font-semibold">Privacy</h2>
        <p className="text-sm text-muted-foreground">
          Rushd stores your email, academic data (classes, assignments, exams,
          study availability), and basic usage events so the planning engine
          can work and so we can tell whether Rushd is actually helping.
          We don&apos;t sell data or share it with third parties. Full details:{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section className="space-y-4 border-t border-destructive/30 pt-8">
        <h2 className="font-heading text-lg font-semibold text-destructive">
          Danger zone
        </h2>
        <DeleteAccount />
      </section>
    </div>
  );
}
