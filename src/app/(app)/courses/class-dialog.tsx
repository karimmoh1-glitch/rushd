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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClass, updateClass } from "@/server/actions/classes";
import { CLASS_COLORS, DEFAULT_CLASS_COLOR } from "@/lib/class-colors";
import { PRIORITY_LABELS } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { ClassInput } from "@/lib/validation/classes";

export interface ClassDialogInitialData extends ClassInput {
  id: string;
}

function submitLabel(pending: boolean, editing: boolean): string {
  if (pending) return "Saving…";
  if (editing) return "Save changes";
  return "Add course";
}

export function ClassDialog({
  open,
  onOpenChange,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ClassDialogInitialData;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The key gives each course (or "new") its own fresh form state. */}
        <ClassDialogForm
          key={initialData?.id ?? "new"}
          initialData={initialData}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ClassDialogForm({
  initialData,
  onDone,
}: {
  initialData?: ClassDialogInitialData;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialData?.name ?? "");
  const [teacher, setTeacher] = useState(initialData?.teacher ?? "");
  const [period, setPeriod] = useState(initialData?.period ?? "");
  const [color, setColor] = useState<string>(
    initialData?.color ?? DEFAULT_CLASS_COLOR,
  );
  const [priority, setPriority] = useState<ClassInput["priority"]>(
    initialData?.priority ?? "MEDIUM",
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input: ClassInput = {
      name,
      teacher: teacher || undefined,
      period: period || undefined,
      color,
      priority,
    };

    startTransition(async () => {
      let result;
      if (initialData) {
        result = await updateClass(initialData.id, input);
      } else {
        result = await createClass(input);
      }

      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(initialData ? "Course updated." : "Course added.");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Edit course" : "Add a course"}</DialogTitle>
        <DialogDescription>
          Name, color, and priority are used to build your plan.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="class-name">Name</Label>
          <Input
            id="class-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. AP Chemistry"
            maxLength={80}
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="class-teacher">Teacher (optional)</Label>
            <Input
              id="class-teacher"
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class-period">Period (optional)</Label>
            <Input
              id="class-period"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              placeholder="e.g. Period 3"
              maxLength={40}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex gap-2">
            {CLASS_COLORS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={`Color ${option.name}`}
                aria-pressed={color === option.value}
                onClick={() => setColor(option.value)}
                className={cn(
                  "h-7 w-7 rounded-full ring-offset-2 ring-offset-background",
                  color === option.value && "ring-2 ring-ring",
                )}
                style={{ backgroundColor: option.value }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-priority">Priority</Label>
          <Select
            value={priority}
            onValueChange={(value) => value && setPriority(value as ClassInput["priority"])}
          >
            <SelectTrigger id="class-priority">
              <SelectValue>
                {(value: ClassInput["priority"]) => PRIORITY_LABELS[value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {submitLabel(pending, Boolean(initialData))}
        </Button>
      </DialogFooter>
    </form>
  );
}
