"use client";

import { useState, useTransition } from "react";
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
import type { AssignmentInput } from "@/lib/validation/assignments";

export interface AssignmentRowData extends AssignmentInput {
  id: string;
  className: string;
  classColor: string;
  source?: "MANUAL" | "CANVAS";
  canvasUrl?: string | null;
  estimatedByRushd?: boolean;
  canvasRemoved?: boolean;
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

  function toggleComplete(checked: boolean) {
    startTransition(async () => {
      const result = await setAssignmentStatus(
        data.id,
        checked ? "COMPLETED" : "NOT_STARTED",
      );
      if ("error" in result) toast.error(result.error);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAssignment(data.id);
      if ("error" in result) toast.error(result.error);
      else toast.success("Assignment deleted.");
    });
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Checkbox
            checked={completed}
            onCheckedChange={(v) => toggleComplete(v === true)}
            disabled={pending}
            aria-label={completed ? "Mark not started" : "Mark completed"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "truncate font-medium",
                  completed && "text-muted-foreground line-through",
                )}
              >
                {data.title}
              </p>
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
              {data.source === "CANVAS" && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  {data.canvasRemoved ? "Removed from Canvas" : "Canvas"}
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

          {data.canvasUrl && (
            <a
              href={data.canvasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
              aria-label={`Open ${data.title} in Canvas (opens in a new tab)`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Canvas
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
