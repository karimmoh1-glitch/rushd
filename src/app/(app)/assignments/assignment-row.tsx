"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
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
}

export function AssignmentRow({
  data,
  classes,
}: {
  data: AssignmentRowData;
  classes: ClassOption[];
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
              {overdue && (
                <Badge variant="destructive" className="shrink-0">
                  Overdue
                </Badge>
              )}
            </div>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: data.classColor }}
              />
              {data.className} · {formatDueDate(due)} ·{" "}
              {formatDuration(data.estimatedMinutes)}
            </p>
          </div>

          {!completed && (
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
      />
    </>
  );
}
