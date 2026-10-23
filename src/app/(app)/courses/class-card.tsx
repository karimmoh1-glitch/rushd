"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { setClassArchived, deleteClass } from "@/server/actions/classes";
import { ClassDialog } from "./class-dialog";
import type { ClassInput } from "@/lib/validation/classes";
import { levelLabel } from "@/lib/courses/catalog";
import type { TermProgress } from "@/lib/courses/term";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<ClassInput["priority"], string> = {
  LOW: "Low priority",
  MEDIUM: "Medium priority",
  HIGH: "High priority",
};

export interface ClassCardData extends ClassInput {
  id: string;
  archived: boolean;
  assignmentCount: number;
  examCount: number;
  /** Where today falls in the term, worked out on the server in the student's time zone. */
  term?: TermProgress | null;
}

/** "Aug 25" from "2026-08-25", without time-zone shifts. */
function shortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "AP · CHEM 101 · Lincoln High", only the parts that are set. */
function courseIdentity(data: ClassCardData): string {
  const parts: string[] = [];
  const level = levelLabel(data.level);
  if (level) parts.push(level);
  if (data.code) parts.push(data.code);
  if (data.institution) parts.push(data.institution);
  return parts.join(" · ");
}

/** "Aug 25 – Dec 18", "Ends Dec 18", or nothing. */
function termRange(data: ClassCardData): string {
  if (data.termStart && data.termEnd) return `${shortDate(data.termStart)} – ${shortDate(data.termEnd)}`;
  if (data.termEnd) return `Ends ${shortDate(data.termEnd)}`;
  return "";
}

function termNote(term: TermProgress): string {
  if (term.state === "upcoming") return "Not started";
  if (term.state === "ended") return "Term ended";
  return `Week ${term.week} of ${term.weeks}`;
}

export function ClassCard({ data, timeZone }: { data: ClassCardData; timeZone?: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Ms. Lee · Period 3"; empty when neither is set.
  const details = [data.teacher, data.period].filter(Boolean).join(" · ");
  const identity = courseIdentity(data);
  const range = termRange(data);
  // A course with work in it can't be deleted, only archived.
  const hasWork = data.assignmentCount > 0 || data.examCount > 0;

  function toggleArchived() {
    startTransition(async () => {
      const result = await setClassArchived(data.id, !data.archived);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(data.archived ? "Course restored." : "Course archived.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteClass(data.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Course deleted.");
      }
    });
  }

  return (
    <>
      <article
        style={{ ["--course" as string]: data.color }}
        className={cn(
          "relative flex flex-col overflow-hidden rounded-xl bg-card p-4 pt-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] transition-shadow duration-200 hover:ring-foreground/15 sm:p-5 sm:pt-6",
          data.archived && "opacity-65",
        )}
      >
        <span aria-hidden="true" className="course-rule absolute inset-x-0 top-0 h-1" />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/courses/${data.id}`}
              className="font-display text-xl font-medium leading-tight tracking-tight outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {data.name}
            </Link>
            {identity && <p className="course-ink mt-1 truncate text-xs font-medium">{identity}</p>}
            {details && <p className="mt-0.5 truncate text-xs text-muted-foreground">{details}</p>}
          </div>
          <div className="relative z-10 -mr-2 -mt-2 flex shrink-0 items-center gap-1">
            {data.archived && <Badge variant="outline">Archived</Badge>}
            {data.priority === "HIGH" && (
              <Badge variant="outline" className="border-warning text-warning">
                {PRIORITY_LABEL[data.priority]}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label={`Options for ${data.name}`} disabled={pending}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={toggleArchived}>{data.archived ? "Restore" : "Archive"}</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={handleDelete} disabled={hasWork}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(range || data.term) && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{range}</span>
              {data.term && <span className="tabular-nums text-muted-foreground">{termNote(data.term)}</span>}
            </div>
            {data.term?.state === "running" && (
              <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                <span className="course-rule block h-full rounded-full" style={{ width: `${data.term.percent}%` }} />
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {data.assignmentCount} assignment{data.assignmentCount === 1 ? "" : "s"},{" "}
              {data.examCount} exam{data.examCount === 1 ? "" : "s"}
            </span>
            {data.weeklyHours ? <span className="tabular-nums">Goal {data.weeklyHours}h a week</span> : null}
          </div>
        </div>
      </article>

      <ClassDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        timeZone={timeZone}
        initialData={{
          id: data.id,
          name: data.name,
          teacher: data.teacher,
          period: data.period,
          color: data.color,
          priority: data.priority,
          level: data.level,
          code: data.code,
          institution: data.institution,
          subject: data.subject,
          termStart: data.termStart,
          termEnd: data.termEnd,
          weeklyHours: data.weeklyHours,
        }}
      />
    </>
  );
}
