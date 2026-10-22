"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, CircleDashed, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { applyCanvasSync, previewCanvasSync, saveCourseSelection } from "@/server/actions/canvas";
import type { SyncReport } from "@/lib/canvas/service";
import { formatDuration, formatDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type StepId = "courses" | "gather" | "review" | "build";
type StepState = "pending" | "active" | "done" | "error";

const STEP_LABELS: Record<StepId, string> = {
  courses: "Saving your course choices",
  gather: "Gathering assignments and checking deadlines",
  review: "Review what changes",
  build: "Importing and rebuilding your schedule",
};

type Phase =
  | { kind: "idle" }
  | { kind: "running"; steps: Record<StepId, StepState>; error?: string }
  | { kind: "review"; steps: Record<StepId, StepState>; report: SyncReport }
  | { kind: "done"; steps: Record<StepId, StepState>; report: SyncReport };

const initialSteps = (includeCourses: boolean): Record<StepId, StepState> => ({
  courses: includeCourses ? "active" : "done",
  gather: includeCourses ? "pending" : "active",
  review: "pending",
  build: "pending",
});

/**
 * Runs a sync as a sequence of REAL server calls. Each step's status changes
 * only when its call actually returns, so the progress shown is the true
 * progress. When the sync would change anything, the student reviews the
 * changes (and how the plan shifts) before anything is written.
 */
export function useSyncFlow(timeZone: string) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function start(courseIds: string[] | null) {
    const steps = initialSteps(courseIds !== null);
    setPhase({ kind: "running", steps: { ...steps } });

    if (courseIds !== null) {
      const saved = await saveCourseSelection({ courseIds });
      if ("error" in saved) {
        setPhase({ kind: "running", steps: { ...steps, courses: "error" }, error: saved.error });
        return;
      }
      steps.courses = "done";
      steps.gather = "active";
      setPhase({ kind: "running", steps: { ...steps } });
    }

    const preview = await previewCanvasSync();
    if ("error" in preview) {
      setPhase({ kind: "running", steps: { ...steps, gather: "error" }, error: preview.error });
      router.refresh();
      return;
    }
    steps.gather = "done";
    const report = preview.data;
    const s = report.summary;
    const hasChanges = s.created + s.updated + s.removed > 0;

    if (hasChanges) {
      steps.review = "active";
      setPhase({ kind: "review", steps: { ...steps }, report });
      return;
    }
    // Nothing would change: apply directly (it just records the sync time).
    steps.review = "done";
    await build(steps);
  }

  async function build(stepsIn?: Record<StepId, StepState>) {
    const steps = { ...(stepsIn ?? (phase.kind !== "idle" ? phase.steps : initialSteps(false))) };
    steps.review = "done";
    steps.build = "active";
    setPhase({ kind: "running", steps: { ...steps } });
    const applied = await applyCanvasSync();
    if ("error" in applied) {
      setPhase({ kind: "running", steps: { ...steps, build: "error" }, error: applied.error });
      router.refresh();
      return;
    }
    steps.build = "done";
    setPhase({ kind: "done", steps: { ...steps }, report: applied.data });
    router.refresh();
    const s = applied.data.summary;
    toast.success(
      s.created + s.updated + s.removed === 0
        ? "Canvas is up to date."
        : `Imported ${s.created} new, updated ${s.updated}.`,
    );
  }

  const panel =
    phase.kind === "idle" ? null : (
      <SyncPanel
        phase={phase}
        timeZone={timeZone}
        onConfirm={() => build()}
        onClose={() => setPhase({ kind: "idle" })}
      />
    );

  return { start, panel, busy: phase.kind === "running" };
}

function StepRow({ id, state }: { id: StepId; state: StepState }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          state === "done" && "border-transparent bg-primary text-primary-foreground",
          state === "active" && "border-primary text-primary",
          state === "pending" && "border-border text-muted-foreground",
          state === "error" && "border-destructive text-destructive",
        )}
        aria-hidden="true"
      >
        {state === "done" ? (
          <Check className="h-3.5 w-3.5" />
        ) : state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "error" ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5" />
        )}
      </span>
      <span className={cn(state === "pending" ? "text-muted-foreground" : "text-foreground")}>
        {STEP_LABELS[id]}
        <span className="sr-only">
          {state === "done" ? " (done)" : state === "active" ? " (in progress)" : state === "error" ? " (failed)" : ""}
        </span>
      </span>
    </li>
  );
}

function SyncPanel({
  phase,
  timeZone,
  onConfirm,
  onClose,
}: {
  phase: Exclude<Phase, { kind: "idle" }>;
  timeZone: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const order: StepId[] = ["courses", "gather", "review", "build"];
  const report = phase.kind === "review" || phase.kind === "done" ? phase.report : null;
  const error = phase.kind === "running" ? phase.error : undefined;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="surface rounded-xl p-5 sm:p-6"
      aria-live="polite"
      aria-label="Canvas sync progress"
    >
      <ol className="space-y-3">
        {order.map((id) => (
          <StepRow key={id} id={id} state={phase.steps[id]} />
        ))}
      </ol>

      {error && (
        <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {report && (
          <motion.div
            key={phase.kind}
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ReportView report={report} timeZone={timeZone} final={phase.kind === "done"} />
            <div className="mt-6 flex flex-wrap gap-2">
              {phase.kind === "review" ? (
                <>
                  <Button onClick={onConfirm}>Import and build my plan</Button>
                  <Button variant="outline" onClick={onClose}>
                    Not now
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/plan" className={buttonVariants()}>
                    See my plan
                  </Link>
                  <Button variant="outline" onClick={onClose}>
                    Done
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ReportView({ report, timeZone, final }: { report: SyncReport; timeZone: string; final: boolean }) {
  const s = report.summary;
  const impact = report.impact;
  const failed = report.courses.filter((c) => !c.ok);

  return (
    <div className="mt-6 space-y-6 border-t border-border pt-6">
      <div>
        <h3 className="font-semibold">{final ? "Imported" : "Here's what will change"}</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={s.created} label="new assignments" />
          <Stat value={s.updated} label="updated" />
          <Stat value={s.completed} label="marked done (submitted)" />
          <Stat value={s.removed} label="no longer in Canvas" />
        </div>
        {(s.skippedNoDueDate > 0 || s.skippedUnpublished > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Skipped {s.skippedNoDueDate} without a due date
            {s.skippedUnpublished > 0 && ` and ${s.skippedUnpublished} unpublished`}. Rushd only plans work with a real
            deadline; add your own date to any of them by creating it manually.
          </p>
        )}
      </div>

      {report.samples.created.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">New from Canvas</h4>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {report.samples.created.map((a) => (
              <li key={`${a.course}-${a.title}`} className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {a.title}
                  <span className="text-muted-foreground"> · {a.course}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.complete ? "Submitted" : formatDueDate(new Date(a.dueAt), timeZone)}
                </span>
              </li>
            ))}
          </ul>
          {s.created > report.samples.created.length && (
            <p className="mt-2 text-xs text-muted-foreground">and {s.created - report.samples.created.length} more</p>
          )}
        </div>
      )}

      {report.samples.removed.length > 0 && (
        <p className="text-sm text-muted-foreground">
          No longer listed in Canvas: {report.samples.removed.join(", ")}. They stay in Rushd but leave your plan.
        </p>
      )}

      {impact && !final && (impact.addedOpenMinutes > 0 || impact.shortfallAfter > 0) && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            impact.shortfallAfter > impact.shortfallBefore
              ? "border-warning/40 bg-warning/5"
              : "border-border bg-muted/40",
          )}
        >
          <p className="font-medium">
            Adds about {formatDuration(impact.addedOpenMinutes)} of open work to your plan.
          </p>
          {impact.shortfallAfter > 0 ? (
            <div className="mt-2 flex gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p>
                With your current study time, {formatDuration(impact.shortfallAfter)} won&apos;t fit before its
                deadlines
                {impact.atRisk.length > 0 && <> (most at risk: {impact.atRisk.map((r) => r.title).join(", ")})</>}.
                Your plan will flag these so you can add time or adjust estimates.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">Everything fits in your study time before it&apos;s due.</p>
          )}
        </div>
      )}

      {failed.length > 0 && (
        <p className="text-sm text-warning">
          Couldn&apos;t read {failed.map((c) => c.name).join(", ")} ({failed[0].error}). Those courses were left
          untouched; the rest synced.
        </p>
      )}
    </div>
  );
}
