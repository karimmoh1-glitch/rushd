import type { Metadata } from "next";
import Link from "next/link";
import { InviteCard } from "@/components/referral/invite-card";
import { EmailToggle } from "./email-toggle";
import { emailConfigured } from "@/lib/email/send";
import { aiEnabled } from "@/lib/env";
import { BONUS_MESSAGES, MAX_FRIENDS, referralStats } from "@/lib/referral/referral";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";
import { AvailabilityForm } from "./availability-form";
import { PasswordForm } from "./password-form";
import { DeleteAccount } from "./delete-account";
import { PlanningForm } from "./planning-form";
import { PlanUsage, type SubscriptionSummary } from "./plan-usage";
import { TutorPreferencesForm } from "./tutor-preferences-form";
import { getUsageSummary } from "@/lib/ai/usage";
import { billingMode } from "@/lib/billing/stripe";
import { readPreferences } from "@/lib/tutor/preferences";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { signOutEverywhere } from "@/server/actions/settings";
import { PageHeader, Panel } from "@/components/page-section";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

export const metadata: Metadata = {
  title: "Settings",
};

function describeCanvas(canvas: { status: string; baseUrl: string; lastSyncAt: Date | null } | null): string {
  if (!canvas) return "Import assignments and due dates from your school's Canvas.";
  if (canvas.status === "NEEDS_REAUTH") return "Needs reconnecting: Canvas stopped accepting the saved token.";
  const notSynced = canvas.lastSyncAt ? "" : ", not synced yet";
  return `Connected to ${new URL(canvas.baseUrl).hostname}${notSynced}.`;
}

function describeTeams(teams: { status: string; accountName: string | null; lastSyncAt: Date | null } | null): string {
  if (!teams) return "Import assignments and due dates from Teams for Education.";
  if (teams.status === "NEEDS_REAUTH") return "Needs reconnecting: Microsoft stopped accepting the connection.";
  const account = teams.accountName ? ` as ${teams.accountName}` : "";
  const notSynced = teams.lastSyncAt ? "" : ", not synced yet";
  return `Connected${account}${notSynced}.`;
}

function describeFeed(feed: { status: string; host: string } | null): string {
  if (!feed) return "For schools that turn off Canvas tokens. No token needed.";
  if (feed.status === "ERROR") return "The last read failed. Open it to see why.";
  return `Reading assignments from ${feed.host}.`;
}

function IntegrationRow({
  title,
  description,
  href,
  connected,
}: {
  title: string;
  description: string;
  href: string;
  connected: boolean;
}) {
  return (
    <SettingRow title={title} description={description}>
      <Link href={href} className={buttonVariants({ variant: "outline" })}>
        {connected ? "Manage" : "Connect"}
      </Link>
    </SettingRow>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();

  const [profile, availability, canvas, usage, subscription, teams, feed] = await Promise.all([
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
        emailReminders: true,
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
    db.teamsConnection.findUnique({ where: { userId: user.id }, select: { status: true, accountName: true, lastSyncAt: true } }),
    db.calendarFeed.findUnique({ where: { userId: user.id }, select: { status: true, host: true } }),
  ]);
  const invites = await referralStats(user.id);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://therushd.com").replace(/\/$/, "");

  // Only the fields the plan card needs, with the renewal date in the student's timezone.
  let subscriptionSummary: SubscriptionSummary | null = null;
  if (subscription) {
    let currentPeriodEnd: string | null = null;
    if (subscription.currentPeriodEnd) {
      currentPeriodEnd = formatDateInZone(subscription.currentPeriodEnd, profile?.timezone, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    subscriptionSummary = {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      hasCustomer: Boolean(subscription.stripeCustomerId),
      currentPeriodEnd,
    };
  }

  const sections = [
    { id: "plan", label: "Plan and usage" },
    ...(aiEnabled ? [{ id: "invite", label: "Invite friends" }] : []),
    { id: "tutor", label: "How Rushd teaches" },
    { id: "profile", label: "Profile" },
    { id: "availability", label: "Availability" },
    { id: "planning", label: "Planning" },
    { id: "integrations", label: "Integrations" },
    { id: "account", label: "Account" },
    { id: "your-data", label: "Your data" },
    { id: "danger", label: "Delete account" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your plan, how Rushd teaches and plans for you, your connections, and your account." />

      <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground lg:rounded-md lg:px-2.5 lg:ring-0",
                    section.id === "danger" && "text-destructive hover:text-destructive",
                  )}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-2xl space-y-5">
          <Panel id="plan" title="Plan and usage">
            <PlanUsage
              usage={usage}
              billing={billingMode()}
              subscription={subscriptionSummary}
            />
          </Panel>

          {aiEnabled && (
            <Panel id="invite" title="Invite friends">
              <InviteCard
                url={`${appUrl}/r/${invites.code}`}
                joined={invites.joined}
                qualified={invites.qualified}
                bonus={invites.bonus}
                perFriend={BONUS_MESSAGES}
                maxFriends={MAX_FRIENDS}
              />
            </Panel>
          )}

          <Panel id="tutor" title="How Rushd teaches you" description="Tell the tutor how you learn best. You can change or reset this anytime.">
            <TutorPreferencesForm initial={readPreferences(profile?.tutorPreferences)} instructions={profile?.tutorInstructions ?? ""} />
          </Panel>

          <Panel id="profile" title="Profile">
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
          </Panel>

          <Panel id="availability" title="Study availability" description="Used to build your plan. Changes take effect immediately.">
            <AvailabilityForm current={availability} />
          </Panel>

          <Panel
            id="planning"
            title="Planning"
            description="How Rushd shapes your study blocks. These are yours to set; Rushd never assumes more capacity than this."
          >
            <PlanningForm
              initial={{
                preferredSessionMinutes: profile?.preferredSessionMinutes ?? 60,
                maxDailyMinutes: profile?.maxDailyMinutes ?? 240,
              }}
            />
          </Panel>

          <Panel id="integrations" title="Integrations">
            <div className="divide-y divide-border">
              <IntegrationRow
                title="Canvas LMS"
                description={describeCanvas(canvas)}
                href="/integrations/canvas"
                connected={Boolean(canvas)}
              />
              <IntegrationRow
                title="Microsoft Teams"
                description={describeTeams(teams)}
                href="/integrations/teams"
                connected={Boolean(teams)}
              />
              <IntegrationRow
                title="Canvas calendar feed"
                description={describeFeed(feed)}
                href="/integrations/canvas-calendar"
                connected={Boolean(feed)}
              />
            </div>
          </Panel>

          <Panel id="account" title="Account" description={`Signed in as ${user.email}`}>
            <div className="divide-y divide-border">
              <div id="emails" className="scroll-mt-24 pb-4">
                <EmailToggle on={profile?.emailReminders ?? false} available={emailConfigured()} />
              </div>
              <div className="py-4">
                <h3 className="mb-3 text-sm font-medium">Change password</h3>
                <PasswordForm />
              </div>
              <form action={signOutEverywhere} className="pt-4">
                <SettingRow title="Sign out everywhere" description="Ends every session on every device, including this one." className="py-0">
                  <button type="submit" className={buttonVariants({ variant: "outline" })}>
                    Sign out everywhere
                  </button>
                </SettingRow>
              </form>
            </div>
          </Panel>

          <Panel id="your-data" title="Privacy and your data">
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
            <SettingRow
              title="Download my data"
              description="Everything you've added, as one JSON file. Never your password or tokens."
              className="mt-3 border-t border-border pt-4 pb-0"
            >
              {/* A plain link: the browser downloads the file the server streams. */}
              <a href="/api/account/export" download className={buttonVariants({ variant: "outline" })}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download my data
              </a>
            </SettingRow>
          </Panel>

          <div className="pt-6">
            <Panel
              id="danger"
              tone="danger"
              title="Danger zone"
              description="Deleting your account removes everything in it. Download your data first if you want a copy."
            >
              <DeleteAccount />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A setting with its explanation on the left and its control on the right. */
function SettingRow({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
