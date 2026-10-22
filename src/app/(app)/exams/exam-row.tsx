"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteExam } from "@/server/actions/exams";
import { StartSessionButton } from "@/components/start-session-button";
import { PulseBadge } from "@/components/brand/pulse-badge";
import { ExamDialog, type ClassOption } from "./exam-dialog";
import { formatDuration, formatDueDate, daysUntil, formatDaysUntil } from "@/lib/format";
import type { ExamInput } from "@/lib/validation/exams";

export interface ExamRowData extends ExamInput {
  id: string;
  className: string;
  classColor: string;
  pulse?: number | null;
}

export function ExamRow({
  data,
  classes,
  timeZone,
}: {
  data: ExamRowData;
  classes: ClassOption[];
  timeZone: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const examDate = new Date(data.examAt);
  const days = daysUntil(examDate, timeZone);
  const soon = days >= 0 && days <= 3;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExam(data.id);
      if ("error" in result) toast.error(result.error);
      else toast.success("Exam deleted.");
    });
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{data.title}</p>
              {soon && (
                <Badge variant="outline" className="shrink-0 border-warning text-warning">
                  {formatDaysUntil(examDate, timeZone)}
                </Badge>
              )}
              {days < 0 && (
                <Badge variant="secondary" className="shrink-0">
                  Past
                </Badge>
              )}
            </div>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: data.classColor }}
              />
              {data.className} · {formatDueDate(examDate, timeZone)} · Prep:{" "}
              {formatDuration(data.prepMinutes)}
            </p>
          </div>

          {data.pulse != null && <PulseBadge pulse={data.pulse} className="shrink-0" />}
          <StartSessionButton target={{ examId: data.id }} source="MANUAL" />

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

      <ExamDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        classes={classes}
        initialData={{
          id: data.id,
          classId: data.classId,
          title: data.title,
          examAt: data.examAt,
          prepMinutes: data.prepMinutes,
          priority: data.priority,
          notes: data.notes,
        }}
      />
    </>
  );
}
