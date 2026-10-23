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

function submitLabel(pending: boolean, editing: boolean): string {
  if (pending) return "Saving…";
  if (editing) return "Save changes";
  return "Add assignment";
}

export function AssignmentDialog({
  open,
  onOpenChange,
  classes,
  prefill,
  initialData,
  managedByCanvas = false,
  estimatedByRushd = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassOption[];
  prefill?: AssignmentPrefill;
  initialData?: AssignmentDialogInitialData;
  /** Canvas owns title, class and due date for imported work. */
  managedByCanvas?: boolean;
  estimatedByRushd?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AssignmentDialogForm
          key={initialData?.id ?? "new"}
          classes={classes}
          prefill={prefill}
          initialData={initialData}
          managedByCanvas={managedByCanvas}
          estimatedByRushd={estimatedByRushd}
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
  managedByCanvas,
  estimatedByRushd,
  onDone,
}: {
  classes: ClassOption[];
  prefill?: AssignmentPrefill;
  initialData?: AssignmentDialogInitialData;
  managedByCanvas: boolean;
  estimatedByRushd: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState(
    initialData?.classId ?? prefill?.classId ?? classes[0]?.id ?? "",
  );
  const [title, setTitle] = useState(initialData?.title ?? prefill?.title ?? "");
  const [dueAt, setDueAt] = useState(() => {
    const startingDueAt = initialData?.dueAt ?? prefill?.dueAt;
    if (!startingDueAt) return "";
    return toDatetimeLocalValue(new Date(startingDueAt));
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
  const [weight, setWeight] = useState(initialData?.weightPercent ? String(initialData.weightPercent) : "");

  // Fields Canvas controls are shown read-only and greyed out.
  const lockedFieldClass = managedByCanvas ? "bg-muted text-muted-foreground" : undefined;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      weightPercent: weight.trim() ? Number(weight) : null,
    };

    startTransition(async () => {
      let result;
      if (initialData) {
        result = await updateAssignment(initialData.id, input);
      } else {
        result = await createAssignment(input);
      }

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
          {managedByCanvas
            ? "Imported from Canvas. Title, course, and due date stay in sync with Canvas; your estimate, priority, status, and notes are yours."
            : "Rushd uses the due date, effort, and priority to build your plan."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="assignment-title">Title</Label>
          <Input
            id="assignment-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Lab report: acid-base titration"
            maxLength={160}
            required
            autoFocus={!managedByCanvas}
            readOnly={managedByCanvas}
            aria-readonly={managedByCanvas || undefined}
            className={lockedFieldClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-class">Course</Label>
          <Select value={classId} onValueChange={(value) => value && setClassId(value)} disabled={managedByCanvas}>
            <SelectTrigger id="assignment-class" className="w-full">
              <SelectValue>
                {(value: string) => classes.find((c) => c.id === value)?.name ?? "Choose a class"}
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
              onChange={(event) => setDueAt(event.target.value)}
              required
              readOnly={managedByCanvas}
              aria-readonly={managedByCanvas || undefined}
              className={lockedFieldClass}
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
              onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
              required
              aria-describedby={estimatedByRushd ? "assignment-effort-hint" : undefined}
            />
            {estimatedByRushd && (
              <p id="assignment-effort-hint" className="text-xs text-muted-foreground">
                Rushd&apos;s estimate from the assignment type and points. Change it if it&apos;s off.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="assignment-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => value && setPriority(value as AssignmentInput["priority"])}
            >
              <SelectTrigger id="assignment-priority" className="w-full">
                <SelectValue>
                  {(value: AssignmentInput["priority"]) => PRIORITY_LABELS[value]}
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
              onValueChange={(value) => value && setStatus(value as AssignmentInput["status"])}
            >
              <SelectTrigger id="assignment-status" className="w-full">
                <SelectValue>
                  {(value: AssignmentInput["status"]) => STATUS_LABELS[value]}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="assignment-weight">Share of grade (optional)</Label>
            <div className="relative">
              <Input
                id="assignment-weight"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="e.g. 10"
                className="pr-8"
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-notes">Notes (optional)</Label>
          <Textarea
            id="assignment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending || classes.length === 0}>
          {submitLabel(pending, Boolean(initialData))}
        </Button>
      </DialogFooter>
    </form>
  );
}
