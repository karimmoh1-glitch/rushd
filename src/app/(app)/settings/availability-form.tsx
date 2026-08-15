"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateAvailability } from "@/server/actions/settings";
import { AVAILABILITY_PRESETS, presetToWindows } from "@/lib/planning/availability-presets";
import { cn } from "@/lib/utils";

interface Window {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

function initialSelectedPresets(current: Window[]): Set<string> {
  const selected = new Set<string>();
  for (const preset of AVAILABILITY_PRESETS) {
    const expected = presetToWindows(preset.id);
    const matches = expected.every((ew) =>
      current.some(
        (cw) =>
          cw.dayOfWeek === ew.dayOfWeek &&
          cw.startMinute === ew.startMinute &&
          cw.endMinute === ew.endMinute,
      ),
    );
    if (matches) selected.add(preset.id);
  }
  return selected;
}

export function AvailabilityForm({ current }: { current: Window[] }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(() => initialSelectedPresets(current));
  const [dirty, setDirty] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateAvailability({ presetIds: Array.from(selected) });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Study availability updated.");
        setDirty(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {AVAILABILITY_PRESETS.map((preset) => {
          const isSelected = selected.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => toggle(preset.id)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                isSelected
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-muted-foreground">
                {preset.days.length === 5 ? "Mon–Fri" : "Sat–Sun"}
              </div>
            </button>
          );
        })}
      </div>
      <Button type="button" onClick={handleSave} disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save availability"}
      </Button>
    </div>
  );
}
