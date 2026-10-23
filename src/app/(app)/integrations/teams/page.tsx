import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { teamsAvailable } from "@/lib/teams/service";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { TeamsControls } from "./teams-controls";

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
    <div className="max-w-2xl space-y-8">
      <header>
        <Link href="/settings#integrations" className="text-sm text-muted-foreground hover:text-foreground">Settings</Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Microsoft Teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring in assignments and due dates from Teams for Education. Rushd only reads: it never submits work, posts, or
          changes anything in Teams.
        </p>
      </header>

      {errorMessage && <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">{errorMessage}</p>}
      {params.connected && <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm">Connected. Choose the classes to sync below.</p>}

      {!connection ? (
        <section className="space-y-4">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>Works with school or work Microsoft accounts that use Teams assignments.</li>
            <li>You sign in with Microsoft; Rushd never sees your password.</li>
            <li>Rushd reads your classes, assignments, due dates, points, and whether you&apos;ve turned work in. Not grades or files.</li>
            <li>Some schools require an administrator to approve Rushd first.</li>
          </ul>
          {available ? (
            <a href="/api/integrations/teams/start" className={buttonVariants()}>Connect Microsoft Teams</a>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Teams connections aren&apos;t set up on this server yet. Add work by hand or connect Canvas in the meantime.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="space-y-1 text-sm">
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
        </>
      )}
    </div>
  );
}
