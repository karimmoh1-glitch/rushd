"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfirmSummary } from "@/lib/syllabus/service";
import { SyllabusImport } from "./syllabus-import";

/**
 * A self-contained "Import your syllabus" step for another flow, such as
 * onboarding's "add work" step. Starts as one optional button; opens the full
 * upload/paste → review → confirm flow in place. Nothing is saved until the
 * student confirms the review.
 *
 * Mount it with a course the signed-in student owns (the server re-checks):
 *
 *   import { SyllabusImportEntry } from "@/components/syllabus/syllabus-import-entry";
 *   <SyllabusImportEntry classId={course.id} courseName={course.name} onImported={(summary) => ...} />
 *
 * `onImported` gets counts only ({ assignments, exams, topics, duplicatesSkipped, ... }).
 * It works with AI off: the rules-based reader is the default path.
 */
export function SyllabusImportEntry({
  classId,
  courseName,
  onImported,
  defaultOpen = false,
}: {
  classId: string;
  courseName?: string;
  onImported?: (summary: ConfirmSummary) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/[0.07]">
        <p className="flex items-start gap-2 text-sm">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            Have the syllabus{courseName ? ` for ${courseName}` : ""}? Rushd can read its dates and topics for you to check.
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Import syllabus
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card px-4 py-5 ring-1 ring-foreground/[0.07] sm:px-5">
      <SyllabusImport classId={classId} compact onComplete={onImported} />
    </div>
  );
}
