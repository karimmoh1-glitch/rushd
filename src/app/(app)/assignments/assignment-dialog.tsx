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
import {
  createAssignment,
  updateAssignment,
} from "@/server/actions/assignments";
import { PRIORITY_LABELS } from "@/lib/priority";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import type { AssignmentInput } from "@/lib/validation/assignments";

const STATUS_LABELS = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
} as const;

export interface ClassOption {
  id: string;
  name: string;
  color: string;
}

export interface AssignmentDialogInitialData extends AssignmentInput {
  id: string;
}

/** Pre-fills a *new* assignment's fields (e.g. from quick-add's parsed
 * draft) without implying an existing row is being edited. */
export interface AssignmentPrefill {
  classId?: string;
  title?: string;
  dueAt?: string; // ISO
  estimatedMinutes?: number;
  priority?: AssignmentInput["priority"];
}

export function AssignmentDialog({
  open,
  onOpenChange,
  classes,
  prefill,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassOption[];
  prefill?: AssignmentPrefill;
  initialData?: AssignmentDialogInitialData;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AssignmentDialogForm
          key={initialData?.id ?? "new"}
          classes={classes}
          prefill={prefill}
          initialData={initialData}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AssignmentDialogForm({
  classes,
  prefill,
  initialData,
  onDone,
}: {
  classes: ClassOption[];
  prefill?: AssignmentPrefill;
  initialData?: AssignmentDialogInitialData;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState(
    initialData?.classId ?? prefill?.classId ?? classes[0]?.id ?? "",
  );
  const [title, setTitle] = useState(initialData?.title ?? prefill?.title ?? "");
  const [dueAt, setDueAt] = useState(() => {
    const source = initialData?.dueAt ?? prefill?.dueAt;
    return source ? toDatetimeLocalValue(new Date(source)) : "";
  });
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initialData?.estimatedMinutes ?? prefill?.estimatedMinutes ?? 30,
  );
  const [priority, setPriority] = useState<AssignmentInput["priority"]>(
    initialData?.priority ?? prefill?.priority ?? "MEDIUM",
  );
  const [status, setStatus] = useState<AssignmentInput["status"]>(
    initialData?.status ?? "NOT_STARTED",
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueAt) {
      toast.error("Choose a due date.");
      return;
    }

    const input: AssignmentInput = {
      classId,
      title,
      dueAt: new Date(dueAt).toISOString(),
      estimatedMinutes,
      priority,
      status,
      notes: notes || undefined,
    };

    startTransition(async () => {
      const result = initialData
        ? await updateAssignment(initialData.id, input)
        : await createAssignment(input);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(initialData ? "Assignment updated." : "Assignment added.");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {initialData ? "Edit assignment" : "Add an assignment"}
        </DialogTitle>
        <DialogDescription>
          Rushd uses the due date, effort, and priority to build your plan.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="assignment-title">Title</Label>
          <Input
            id="assignment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lab report: acid-base titration"
            maxLength={160}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-class">Class</Label>
          <Select value={classId} onValueChange={(v) => v && setClassId(v)}>
            <SelectTrigger id="assignment-class" className="w-full">
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
            <Label htmlFor="assignment-due">Due</Label>
            <Input
              id="assignment-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-effort">Est. time (minutes)</Label>
            <Input
              id="assignment-effort"
              type="number"
              min={5}
              max={1000}
              step={5}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="assignment-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => v && setPriority(v as AssignmentInput["priority"])}
            >
              <SelectTrigger id="assignment-priority" className="w-full">
                <SelectValue>
                  {(v: AssignmentInput["priority"]) => PRIORITY_LABELS[v]}
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
            <Label htmlFor="assignment-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => v && setStatus(v as AssignmentInput["status"])}
            >
              <SelectTrigger id="assignment-status" className="w-full">
                <SelectValue>
                  {(v: AssignmentInput["status"]) => STATUS_LABELS[v]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOT_STARTED">Not started</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-notes">Notes (optional)</Label>
          <Textarea
            id="assignment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending || classes.length === 0}>
          {pending
            ? "Saving…"
            : initialData
              ? "Save changes"
              : "Add assignment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
