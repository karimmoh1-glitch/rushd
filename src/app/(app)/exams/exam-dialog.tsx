"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createExam, updateExam } from "@/server/actions/exams";
import { PRIORITY_LABELS } from "@/lib/priority";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import type { ExamInput } from "@/lib/validation/exams";

export interface ClassOption {
  id: string;
  name: string;
  color: string;
}

export interface ExamDialogInitialData extends ExamInput {
  id: string;
}

export function ExamDialog({
  open,
  onOpenChange,
  classes,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassOption[];
  initialData?: ExamDialogInitialData;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ExamDialogForm
          key={initialData?.id ?? "new"}
          classes={classes}
          initialData={initialData}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExamDialogForm({
  classes,
  initialData,
  onDone,
}: {
  classes: ClassOption[];
  initialData?: ExamDialogInitialData;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState(
    initialData?.classId ?? classes[0]?.id ?? "",
  );
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [examAt, setExamAt] = useState(
    initialData ? toDatetimeLocalValue(new Date(initialData.examAt)) : "",
  );
  const [prepMinutes, setPrepMinutes] = useState(
    initialData?.prepMinutes ?? 120,
  );
  const [priority, setPriority] = useState<ExamInput["priority"]>(
    initialData?.priority ?? "MEDIUM",
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!examAt) {
      toast.error("Choose an exam date.");
      return;
    }

    const input: ExamInput = {
      classId,
      title,
      examAt: new Date(examAt).toISOString(),
      prepMinutes,
      priority,
      notes: notes || undefined,
    };

    startTransition(async () => {
      const result = initialData
        ? await updateExam(initialData.id, input)
        : await createExam(input);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(initialData ? "Exam updated." : "Exam added.");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Edit exam" : "Add an exam"}</DialogTitle>
        <DialogDescription>
          Exams get stronger prioritization as the date approaches.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="exam-title">Title</Label>
          <Input
            id="exam-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Unit 4 test"
            maxLength={160}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-class">Class</Label>
          <Select value={classId} onValueChange={(v) => v && setClassId(v)}>
            <SelectTrigger id="exam-class" className="w-full">
              <SelectValue>
                {(v: string) => classes.find((c) => c.id === v)?.name ?? "Choose a class"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="exam-date">Date</Label>
            <Input
              id="exam-date"
              type="datetime-local"
              value={examAt}
              onChange={(e) => setExamAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-prep">Prep time (minutes)</Label>
            <Input
              id="exam-prep"
              type="number"
              min={15}
              max={3000}
              step={15}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-priority">Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => v && setPriority(v as ExamInput["priority"])}
          >
            <SelectTrigger id="exam-priority" className="w-full">
              <SelectValue>
                {(v: ExamInput["priority"]) => PRIORITY_LABELS[v]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-notes">Notes (optional)</Label>
          <Textarea
            id="exam-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending || classes.length === 0}>
          {pending ? "Saving…" : initialData ? "Save changes" : "Add exam"}
        </Button>
      </DialogFooter>
    </form>
  );
}
