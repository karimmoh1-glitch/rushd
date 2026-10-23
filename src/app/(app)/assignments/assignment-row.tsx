"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDuration, formatDueDate, isOverdue } from "@/lib/format";
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
  /** Added by the student from their syllabus import. */
  fromSyllabus?: boolean;
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
  const overdue = !completed && isOverdue(due);
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

  return (
    <>
      <Card className="py-0 transition-shadow duration-200 hover:ring-foreground/15">
        <CardContent className="flex items-center gap-3 py-3 sm:py-3.5">
          <Checkbox
            checked={completed}
            onCheckedChange={(checked) => toggleComplete(checked === true)}
            disabled={pending}
            aria-label={completed ? "Mark not started" : "Mark completed"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/assignments/${data.id}`}
                className={cn(
                  "truncate font-medium underline-offset-4 hover:underline",
                  completed && "text-muted-foreground line-through",
                )}
              >
                {data.title}
              </Link>
              {data.priority === "HIGH" && !completed && (
                <Badge variant="outline" className="shrink-0 border-warning text-warning">
                  High
                </Badge>
              )}
              {overdue && !data.canvasRemoved && (
                <Badge variant="destructive" className="shrink-0">
                  Overdue
                </Badge>
              )}
              {showSourceBadge && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  {sourceBadgeLabel(data.source, data.canvasRemoved)}
                </Badge>
              )}
              {data.fromSyllabus && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  From syllabus
                </Badge>
              )}
            </div>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: data.classColor }}
              />
              <span className="truncate">
                {data.className} · {formatDueDate(due, timeZone)} ·{" "}
                <span className="tabular-nums">
                  {data.estimatedByRushd ? "~" : ""}
                  {formatDuration(data.estimatedMinutes)}
                </span>
              </span>
            </p>
          </div>

          {!completed && data.pulse != null && <PulseBadge pulse={data.pulse} className="shrink-0" />}

          {data.canvasUrl && (
            <a
              href={data.canvasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
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
        </CardContent>
      </Card>

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
