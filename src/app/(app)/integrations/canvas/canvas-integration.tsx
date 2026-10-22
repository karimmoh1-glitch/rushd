"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { disconnectCanvas, refreshCourses } from "@/server/actions/canvas";
import type { CanvasConnectionView } from "@/lib/canvas/service";
import { formatDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConnectForm } from "./connect-form";
import { useSyncFlow } from "./sync-flow";

export function CanvasIntegration({
  view,
  configured,
  timeZone,
  fromOnboarding,
}: {
  view: CanvasConnectionView | null;
  configured: boolean;
  timeZone: string;
  fromOnboarding: boolean;
}) {
  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Canvas</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {view
            ? "Pick the courses to sync. Rushd imports their assignments and due dates, then builds your plan around your real workload."
            : "Connect your school's Canvas and Rushd imports your assignments and deadlines, then plans your study time around them."}
        </p>
        {fromOnboarding && !view && (
          <p className="mt-3 text-sm text-muted-foreground">
            Optional.{" "}
            <Link href="/dashboard" className="font-medium text-foreground underline underline-offset-4">
              Skip for now
            </Link>{" "}
            and add work manually or from a screenshot.
          </p>
        )}
      </header>

      {!configured ? (
        <div className="surface max-w-2xl rounded-xl p-6 text-sm text-muted-foreground">
          Canvas integration isn&apos;t switched on for this server yet. You can still add assignments manually or{" "}
          <Link href="/import" className="font-medium text-foreground underline underline-offset-4">
            import a screenshot
          </Link>
          .
        </div>
      ) : !view ? (
        <ConnectForm />
      ) : (
        <Connected view={view} timeZone={timeZone} />
      )}
    </div>
  );
}

function Connected({ view, timeZone }: { view: CanvasConnectionView; timeZone: string }) {
  const router = useRouter();
  const savedSelection = useMemo(() => view.courses.filter((c) => c.selected).map((c) => c.id), [view.courses]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(savedSelection));
  const [refreshing, startRefresh] = useTransition();
  const { start, panel, busy } = useSyncFlow(timeZone);

  const selectionChanged =
    selected.size !== savedSelection.length || savedSelection.some((id) => !selected.has(id));
  const hasSynced = view.lastSyncAt !== null;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleRefresh() {
    startRefresh(async () => {
      const r = await refreshCourses();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(`Found ${r.data.courseCount} course${r.data.courseCount === 1 ? "" : "s"}.`);
        router.refresh();
      }
    });
  }

  if (view.status === "NEEDS_REAUTH") {
    return (
      <div className="space-y-6">
        <div role="alert" className="flex max-w-2xl gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            {view.lastSyncError ??
              "Canvas stopped accepting the saved token. Create a new token in Canvas and reconnect to keep syncing."}{" "}
            Your imported assignments are safe.
          </p>
        </div>
        <ConnectForm initialBaseUrl={view.baseUrl} reconnect />
        <DisconnectSection view={view} />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-brand-ink" aria-hidden="true" />
          <div>
            <p className="font-medium">
              Connected{view.canvasUserName ? ` as ${view.canvasUserName}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {new URL(view.baseUrl).hostname}
              {view.lastSyncAt
                ? ` · last synced ${formatDueDate(new Date(view.lastSyncAt), timeZone)}`
                : " · not synced yet"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || busy}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden="true" />
            Refresh course list
          </Button>
          {hasSynced && !selectionChanged && selected.size > 0 && (
            <Button size="sm" onClick={() => start(null)} disabled={busy}>
              Sync now
            </Button>
          )}
        </div>
      </div>

      {view.lastSyncStatus === "partial" && view.lastSyncError && (
        <p className="text-sm text-warning">Last sync was partial: {view.lastSyncError}</p>
      )}
      {view.status === "ERROR" && view.lastSyncError && (
        <p className="text-sm text-destructive">Last sync failed: {view.lastSyncError}</p>
      )}

      <section aria-labelledby="courses-heading" className="space-y-4">
        <div>
          <h2 id="courses-heading" className="text-lg font-semibold">
            Courses to sync
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each course syncs into a Rushd class with the same name. Unchecking a course stops syncing it; anything
            already imported stays.
          </p>
        </div>

        {view.courses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Canvas didn&apos;t list any active courses where you&apos;re a student. If a new term just started, try
            Refresh course list.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {view.courses.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                      checked ? "border-primary/50 bg-accent/40" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggle(c.id, v === true)}
                      className="mt-0.5"
                      disabled={busy}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {[c.courseCode, c.termName].filter(Boolean).join(" · ") || "Canvas course"}
                        {c.className && c.selected && <> · syncs into {c.className}</>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {view.courses.length > 0 && (!hasSynced || selectionChanged) && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => start([...selected])} disabled={busy || selected.size === 0}>
              {hasSynced ? "Save and sync" : `Import from ${selected.size} course${selected.size === 1 ? "" : "s"}`}
            </Button>
            {selected.size === 0 && <span className="text-sm text-muted-foreground">Choose at least one course.</span>}
          </div>
        )}
      </section>

      {panel}

      {view.lastSyncSummary && !panel && (
        <section className="grid grid-cols-2 gap-6 rounded-xl border border-border p-5 sm:grid-cols-4">
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums">{view.importedCount}</p>
            <p className="text-xs text-muted-foreground">assignments from Canvas</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums">{view.courses.filter((c) => c.selected).length}</p>
            <p className="text-xs text-muted-foreground">courses syncing</p>
          </div>
          <div className="col-span-2 text-sm text-muted-foreground">
            Rushd syncs when you press Sync now. New assignments slot into your plan without moving blocks you placed
            yourself.{" "}
            <Link href="/plan" className="font-medium text-foreground underline underline-offset-4">
              Open plan
            </Link>
          </div>
        </section>
      )}

      <DisconnectSection view={view} />
    </div>
  );
}

function DisconnectSection({ view }: { view: CanvasConnectionView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"keep" | "remove">("keep");
  const [pending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      const r = await disconnectCanvas({ removeImported: choice === "remove" });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      toast.success(
        r.data.removedAssignments > 0
          ? `Disconnected. Removed ${r.data.removedAssignments} imported assignments.`
          : "Disconnected. Your imported assignments were kept.",
      );
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 border-t border-border pt-8" aria-labelledby="disconnect-heading">
      <h2 id="disconnect-heading" className="text-lg font-semibold">
        Disconnect
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Deletes the saved token from Rushd and stops syncing. For full cleanup, also delete the Rushd token in Canvas
        under Account, Settings, Approved Integrations.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Disconnect Canvas
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Canvas?</DialogTitle>
            <DialogDescription>
              Rushd deletes your saved token immediately. What should happen to the {view.importedCount} assignment
              {view.importedCount === 1 ? "" : "s"} imported from Canvas?
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={choice} onValueChange={(v) => setChoice(v as "keep" | "remove")} className="gap-3 py-2">
            <Label htmlFor="dc-keep" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem id="dc-keep" value="keep" className="mt-0.5" />
              <span>
                <span className="block font-medium">Keep them</span>
                <span className="block text-sm text-muted-foreground">
                  They stay in your plan as regular assignments and stop updating.
                </span>
              </span>
            </Label>
            <Label htmlFor="dc-remove" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem id="dc-remove" value="remove" className="mt-0.5" />
              <span>
                <span className="block font-medium">Remove them</span>
                <span className="block text-sm text-muted-foreground">
                  Deletes only Canvas-imported assignments. Work you added yourself is never touched.
                </span>
              </span>
            </Label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={pending}>
              {pending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
