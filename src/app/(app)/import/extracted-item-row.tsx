"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/ai";

export interface ClassOption {
  id: string;
  name: string;
}

export interface DraftItem {
  id: string; // client-local key
  included: boolean;
  kind: "assignment" | "exam";
  title: string;
  classId: string;
  classNameGuess: string | null;
  dueAt: string; // datetime-local value
  dueDateConfidence: Confidence;
  minutes: number;
  effortConfidence: Confidence;
}

function ConfidenceBadge({ confidence, label }: { confidence: Confidence; label: string }) {
  if (confidence === "high") return null; // don't clutter the UI for the common case
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-xs",
        confidence === "low" ? "border-warning text-warning" : "text-muted-foreground",
      )}
    >
      {label}: {confidence}
    </Badge>
  );
}

export function ExtractedItemRow({
  item,
  classes,
  onChange,
}: {
  item: DraftItem;
  classes: ClassOption[];
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4 transition-opacity",
        !item.included && "opacity-50",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.included}
          onCheckedChange={(checked) => onChange({ included: checked === true })}
          className="mt-1"
          aria-label={`Include "${item.title}"`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={item.title}
            onChange={(event) => onChange({ title: event.target.value })}
            aria-label="Title"
            className="font-medium"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Class</label>
              <Select value={item.classId} onValueChange={(value) => value && onChange({ classId: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => classes.find((c) => c.id === value)?.name ?? "Choose"}
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
              {item.classNameGuess && (
                <p className="text-xs text-muted-foreground">
                  Screenshot said &quot;{item.classNameGuess}&quot;
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select
                value={item.kind}
                onValueChange={(value) => value && onChange({ kind: value as DraftItem["kind"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: DraftItem["kind"]) => (value === "exam" ? "Exam" : "Assignment")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Due</label>
              <Input
                type="datetime-local"
                value={item.dueAt}
                onChange={(event) => onChange({ dueAt: event.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Minutes</label>
              <Input
                type="number"
                min={5}
                max={3000}
                step={5}
                value={item.minutes}
                onChange={(event) => onChange({ minutes: Number(event.target.value) })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <ConfidenceBadge confidence={item.dueDateConfidence} label="Due date" />
            <ConfidenceBadge confidence={item.effortConfidence} label="Effort" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function draftFromExtracted(
  extracted: {
    title: string;
    kind: "assignment" | "exam";
    classId: string | null;
    classNameGuess: string | null;
    dueAt: string | null;
    dueDateConfidence: Confidence;
    estimatedMinutes: number;
    effortConfidence: Confidence;
  },
  index: number,
  fallbackClassId: string,
  now: Date,
): DraftItem {
  // With no date in the screenshot, guess tomorrow at 11:59 PM and flag it as low confidence.
  const fallbackDue = new Date(now);
  fallbackDue.setDate(now.getDate() + 1);
  fallbackDue.setHours(23, 59, 0, 0);

  return {
    id: `${index}-${extracted.title}`,
    included: true,
    kind: extracted.kind,
    title: extracted.title,
    classId: extracted.classId ?? fallbackClassId,
    classNameGuess: extracted.classNameGuess,
    dueAt: toDatetimeLocalValue(extracted.dueAt ? new Date(extracted.dueAt) : fallbackDue),
    dueDateConfidence: extracted.dueAt ? extracted.dueDateConfidence : "low",
    minutes: extracted.estimatedMinutes,
    effortConfidence: extracted.effortConfidence,
  };
}
