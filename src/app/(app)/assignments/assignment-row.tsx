"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setAssignmentStatus,
  deleteAssignment,
} from "@/server/actions/assignments";
import { StartSessionButton } from "@/components/start-session-button";
import { AssignmentDialog, type ClassOption } from "./assignment-dialog";
import { dueStatus, formatDuration, formatDueDate } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { cn } from "@/lib/utils";
import { PulseBadge } from "@/components/brand/pulse-badge";
import type { AssignmentInput } from "@/lib/validation/assignments";

export interface AssignmentRowData extends AssignmentInput {
  id: string;
  className: string;
  classColor: string;
  source?: "MANUAL" | "CANVAS" | "TEAMS" | "CALENDAR";
  canvasUrl?: string | null;
  /** 1-99, for open work the planner ranks. */
  pulse?: number | null;
  estimatedByRushd?: boolean;
  canvasRemoved?: boolean;
}

/** The small badge that says where the assignment came from. */
function sourceBadgeLabel(source: AssignmentRowData["source"], removed: boolean | undefined): string {
  if (source === "TEAMS") {
    return removed ? "Removed from Teams" : "Teams";
  }
  return removed ? "Removed from Canvas" : "Canvas";
}

export function AssignmentRow({
  data,
  classes,
  timeZone,
}: {
  data: AssignmentRowData;
  classes: ClassOption[];
  timeZone: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const completed = data.status === "COMPLETED";
  const due = new Date(data.dueAt);
  const showSourceBadge = Boolean(data.source) && data.source !== "MANUAL";
  const linkLabel = data.source === "TEAMS" ? "Teams" : "Canvas";

  function toggleComplete(checked: boolean) {
    startTransition(async () => {
      const newStatus = checked ? "COMPLETED" : "NOT_STARTED";
      const result = await setAssignmentStatus(data.id, newStatus);
      if ("error" in result) toast.error(result.error);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAssignment(data.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Assignment deleted.");
      }
    });
  }

  const status = completed || data.canvasRemoved ? null : dueStatus(due, timeZone);

  return (
    <>
      <article
        style={{ ["--course" as string]: data.classColor }}
        className={cn(
          "relative overflow-hidden rounded-xl bg-card shadow-(--shadow-card) ring-1 ring-foreground/[0.07] transition-shadow duration-200 hover:ring-foreground/15",
          completed && "bg-card/60 shadow-none",
        )}
      >
        <span aria-hidden="true" className={cn("course-rule absolute inset-y-0 left-0 w-1", completed && "opacity-40")} />
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3 pl-4 pr-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:py-3.5 sm:pl-5">
          <Checkbox
            checked={completed}
            onCheckedChange={(checked) => toggleComplete(checked === true)}
            disabled={pending}
            aria-label={completed ? "Mark not started" : "Mark completed"}
            className="col-start-1 row-start-1 self-start mt-0.5 sm:mt-0 sm:self-center"
          />
          <div className="col-start-2 row-start-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/assignments/${data.id}`}
                className={cn(
                  "line-clamp-2 min-w-0 font-medium underline-offset-4 hover:underline sm:line-clamp-1",
                  completed && "text-muted-foreground line-through",
                )}
              >
                {data.title}
              </Link>
              {data.priority === "HIGH" && !completed && (
                <Badge variant="outline" className="shrink-0 border-warning/50 text-warning">
                  High
                </Badge>
              )}
              {showSourceBadge && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  {sourceBadgeLabel(data.source, data.canvasRemoved)}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <span className="course-ink truncate font-medium">{data.className}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">
                {data.estimatedByRushd ? "~" : ""}
                {formatDuration(data.estimatedMinutes)}
              </span>
            </p>
          </div>

          {/* Phones: under the title. Wider screens: its own column. */}
          <div className="col-span-2 col-start-2 row-start-2 mt-2 flex items-center gap-3 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:gap-4">
            <div className="order-2 ml-auto sm:order-1 sm:ml-0">
              {!completed && data.pulse != null && <PulseBadge pulse={data.pulse} />}
            </div>
            <div className="order-1 flex items-center gap-2 whitespace-nowrap sm:order-2 sm:w-40 sm:flex-col sm:items-end sm:gap-1">
              {status && <StatusChip status={status} />}
              <span className={cn("text-xs tabular-nums", status === "overdue" ? "text-overdue" : "text-muted-foreground")}>
                {formatDueDate(due, timeZone)}
              </span>
            </div>
          </div>

          <div className="col-start-3 row-start-1 flex items-center gap-1 self-start sm:col-start-4 sm:self-center">
            {data.canvasUrl && (
              <a
                href={data.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
                aria-label={`Open ${data.title} in ${linkLabel} (opens in a new tab)`}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {linkLabel}
              </a>
            )}

            {!completed && !data.canvasRemoved && (
              <StartSessionButton target={{ assignmentId: data.id }} source="MANUAL" />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Options for ${data.title}`}
                    disabled={pending}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </article>

      <AssignmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        classes={classes}
        initialData={{
          id: data.id,
          classId: data.classId,
          title: data.title,
          dueAt: data.dueAt,
          estimatedMinutes: data.estimatedMinutes,
          priority: data.priority,
          status: data.status,
          notes: data.notes,
        }}
        managedByCanvas={data.source === "CANVAS"}
        estimatedByRushd={data.estimatedByRushd}
      />
    </>
  );
}
