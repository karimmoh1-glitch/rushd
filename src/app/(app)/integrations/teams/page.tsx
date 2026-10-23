import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { teamsAvailable } from "@/lib/teams/service";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { TeamsControls } from "./teams-controls";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-section";

const ABOUT = [
  "Works with school or work Microsoft accounts that use Teams assignments.",
  "You sign in with Microsoft; Rushd never sees your password.",
  "Rushd reads your classes, assignments, due dates, points, and whether you've turned work in. Not grades or files.",
  "Some schools require an administrator to approve Rushd first.",
];

export const metadata: Metadata = { title: "Microsoft Teams" };
export const maxDuration = 60;

const ERRORS: Record<string, string> = {
  admin_consent: "Your school requires an administrator to approve Rushd before students can connect Teams. Share this page with your school's IT team.",
  cancelled: "Connecting was cancelled. Nothing was changed.",
  expired: "That sign-in took too long. Try connecting again.",
  state: "That sign-in couldn't be verified. Try connecting again.",
  failed: "Microsoft didn't complete the connection. Try again.",
  unavailable: "Teams connections aren't set up on this server yet.",
};

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const timeZone = user.profile?.timezone;
  const connection = await db.teamsConnection.findUnique({
    where: { userId: user.id },
    select: {
      accountName: true,
      status: true,
      lastSyncAt: true,
      lastSyncError: true,
      classes: { orderBy: { name: "asc" }, select: { id: true, name: true, selected: true } },
    },
  });
  const available = teamsAvailable();
  const errorMessage = params.error ? ERRORS[params.error] : undefined;

  let lastSyncedText = "Not synced yet.";
  if (connection?.lastSyncAt) {
    const when = formatDateInZone(connection.lastSyncAt, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    lastSyncedText = `Last synced ${when}.`;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/settings#integrations", label: "Settings" }}
        title="Microsoft Teams"
        description={
          <>
            Bring in assignments and due dates from Teams for Education. Rushd only reads: it never submits work, posts, or
            changes anything in Teams.
          </>
        }
      />

      {errorMessage && <p role="alert" className="max-w-2xl rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">{errorMessage}</p>}
      {params.connected && <p role="status" className="max-w-2xl rounded-lg border border-border bg-card px-4 py-3 text-sm">Connected. Choose the classes to sync below.</p>}

      {!connection ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <ul className="space-y-3 text-[15px] leading-relaxed">
            {ABOUT.map((line) => (
              <li key={line} className="flex gap-3">
                <Check className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
            {available ? (
              <a href="/api/integrations/teams/start" className={buttonVariants({ className: "w-full" })}>Connect Microsoft Teams</a>
            ) : (
              <p className="text-sm text-muted-foreground">
                Teams connections aren&apos;t set up on this server yet. Add work by hand or{" "}
                <Link href="/integrations/canvas" className="text-foreground underline underline-offset-4">connect Canvas</Link> in the meantime.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <section className="space-y-1 rounded-xl bg-card p-5 text-sm shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
            <p>
              Connected{connection.accountName ? ` as ${connection.accountName}` : ""}.{" "}
              {lastSyncedText}
            </p>
            {connection.status === "NEEDS_REAUTH" && (
              <p className="text-warning">
                Microsoft stopped accepting the connection. <a href="/api/integrations/teams/start" className="underline underline-offset-4">Reconnect</a>.
              </p>
            )}
            {connection.lastSyncError && <p className="text-muted-foreground">Last sync problem: {connection.lastSyncError}</p>}
          </section>
          <TeamsControls classes={connection.classes} />
        </div>
      )}
    </div>
  );
}
