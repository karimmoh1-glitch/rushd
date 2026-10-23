"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { setClassArchived, deleteClass } from "@/server/actions/classes";
import { ClassDialog } from "./class-dialog";
import type { ClassInput } from "@/lib/validation/classes";
import { levelLabel } from "@/lib/courses/catalog";

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
}

/** "Aug 25" from "2026-08-25", without time-zone shifts. */
function shortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function courseDetails(data: ClassCardData): string {
  const parts: string[] = [];
  const level = levelLabel(data.level);
  if (level) parts.push(level);
  if (data.code) parts.push(data.code);
  if (data.institution) parts.push(data.institution);
  if (data.termStart && data.termEnd) parts.push(`${shortDate(data.termStart)} – ${shortDate(data.termEnd)}`);
  else if (data.termEnd) parts.push(`Ends ${shortDate(data.termEnd)}`);
  return parts.join(" · ");
}

export function ClassCard({ data, timeZone }: { data: ClassCardData; timeZone?: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Ms. Lee · Period 3", or a dash when neither is set.
  const details = [data.teacher, data.period].filter(Boolean).join(" · ") || "—";
  // "AP · CHEM 101 · Lincoln High · Aug 25 – Dec 18", only the parts that are set.
  const courseLine = courseDetails(data);
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
      <Card className={data.archived ? "opacity-60" : undefined}>
        <CardContent className="flex items-center gap-3 py-4">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link href={`/courses/${data.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                {data.name}
              </Link>
              {data.priority === "HIGH" && (
                <Badge variant="outline" className="text-warning border-warning">
                  {PRIORITY_LABEL[data.priority]}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {details}
              {" · "}
              {data.assignmentCount} assignment{data.assignmentCount === 1 ? "" : "s"},{" "}
              {data.examCount} exam{data.examCount === 1 ? "" : "s"}
            </p>
            {courseLine && <p className="truncate text-xs text-muted-foreground">{courseLine}</p>}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Options for ${data.name}`}
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
              <DropdownMenuItem onClick={toggleArchived}>
                {data.archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDelete}
                disabled={hasWork}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

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
