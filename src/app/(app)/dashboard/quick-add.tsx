"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseQuickAdd } from "@/server/actions/quick-add";
import {
  AssignmentDialog,
  type AssignmentPrefill,
  type ClassOption,
} from "../assignments/assignment-dialog";
import { ExamDialog, type ExamPrefill } from "../exams/exam-dialog";
import type { QuickAddDraft } from "@/lib/ai/schemas";

function draftToAssignmentPrefill(draft: QuickAddDraft): AssignmentPrefill {
  return {
    classId: draft.classId ?? undefined,
    title: draft.title,
    dueAt: draft.dueAt ?? undefined,
    estimatedMinutes: draft.minutes,
    priority: draft.priority,
  };
}

function draftToExamPrefill(draft: QuickAddDraft): ExamPrefill {
  return {
    classId: draft.classId ?? undefined,
    title: draft.title,
    examAt: draft.dueAt ?? undefined,
    prepMinutes: draft.minutes,
    priority: draft.priority,
  };
}

export function QuickAdd({ classes }: { classes: ClassOption[] }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [assignmentPrefill, setAssignmentPrefill] = useState<AssignmentPrefill | null>(null);
  const [examPrefill, setExamPrefill] = useState<ExamPrefill | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || classes.length === 0) return;

    startTransition(async () => {
      const { draft, usedAI } = await parseQuickAdd(text);
      if (draft.kind === "exam") {
        setExamPrefill(draftToExamPrefill(draft));
      } else {
        setAssignmentPrefill(draftToAssignmentPrefill(draft));
      }
      if (!usedAI) {
        toast.info("Parsed automatically — double-check the details below.");
      }
      setText("");
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              classes.length === 0
                ? "Add a course first to use quick add"
                : "Type it: \"Chem lab report due Friday, about 2 hours\""
            }
            aria-label="Describe an assignment or exam"
            disabled={classes.length === 0 || pending}
            maxLength={300}
          />
        </div>
        <Button type="submit" variant="outline" disabled={classes.length === 0 || pending || !text.trim()}>
          {pending ? "Parsing…" : "Add"}
        </Button>
      </form>

      <AssignmentDialog
        open={assignmentPrefill !== null}
        onOpenChange={(open) => !open && setAssignmentPrefill(null)}
        classes={classes}
        prefill={assignmentPrefill ?? undefined}
      />
      <ExamDialog
        open={examPrefill !== null}
        onOpenChange={(open) => !open && setExamPrefill(null)}
        classes={classes}
        prefill={examPrefill ?? undefined}
      />
    </>
  );
}
