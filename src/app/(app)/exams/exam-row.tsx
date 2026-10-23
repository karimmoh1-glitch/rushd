"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
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
import { formatDuration, formatDueDate, daysUntil, formatDaysUntil, dueStatus } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { cn } from "@/lib/utils";
import type { ExamInput } from "@/lib/validation/exams";

export interface ExamRowData extends ExamInput {
  id: string;
  className: string;
  classColor: string;
  pulse?: number | null;
  /** Added by the student from their syllabus import. */
  fromSyllabus?: boolean;
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
  const past = days < 0;
  const status = past ? null : dueStatus(examDate, timeZone);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExam(data.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Exam deleted.");
      }
    });
  }

  return (
    <>
      <article
        style={{ ["--course" as string]: data.classColor }}
        className={cn(
          "relative overflow-hidden rounded-xl bg-card shadow-(--shadow-card) ring-1 ring-foreground/[0.07] transition-shadow duration-200 hover:ring-foreground/15",
          past && "bg-card/60 shadow-none",
        )}
      >
        <span aria-hidden="true" className={cn("course-rule absolute inset-y-0 left-0 w-1", past && "opacity-40")} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 pl-4 pr-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:py-3.5 sm:pl-5">
          <div className="col-start-1 row-start-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className={cn("line-clamp-2 min-w-0 font-medium sm:line-clamp-1", past && "text-muted-foreground")}>{data.title}</p>
              {data.priority === "HIGH" && !past && (
                <Badge variant="outline" className="shrink-0 border-warning/50 text-warning">
                  High
                </Badge>
              )}
              {past && (
                <Badge variant="secondary" className="shrink-0">
                  Past
                </Badge>
              )}
              {data.fromSyllabus && (
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  From syllabus
                </Badge>
              )}
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <span className="course-ink truncate font-medium">{data.className}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">Prep: {formatDuration(data.prepMinutes)}</span>
            </p>
          </div>

          {/* Phones: under the title. Wider screens: its own column. */}
          <div className="col-span-2 col-start-1 row-start-2 mt-2 flex items-center gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:gap-4">
            <div className="order-2 ml-auto sm:order-1 sm:ml-0">
              {!past && data.pulse != null && <PulseBadge pulse={data.pulse} />}
            </div>
            <div className="order-1 flex items-center gap-2 whitespace-nowrap sm:order-2 sm:w-40 sm:flex-col sm:items-end sm:gap-1">
              {status && <StatusChip status={status} />}
              <span className="text-xs tabular-nums text-muted-foreground">
                {status === "later" || past ? `${formatDaysUntil(examDate, timeZone)} · ` : ""}
                {formatDueDate(examDate, timeZone)}
              </span>
            </div>
          </div>

          <div className="col-start-2 row-start-1 flex items-center gap-1 self-start sm:col-start-3 sm:self-center">
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
          </div>
        </div>
      </article>

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
          weightPercent: data.weightPercent,
        }}
      />
    </>
  );
}
