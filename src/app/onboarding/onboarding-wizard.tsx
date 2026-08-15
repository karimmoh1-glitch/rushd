"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { completeOnboarding } from "@/server/actions/onboarding";
import {
  AVAILABILITY_PRESETS,
  presetToWindows,
} from "@/lib/planning/availability-presets";
import { CLASS_COLORS, DEFAULT_CLASS_COLOR } from "@/lib/class-colors";
import { cn } from "@/lib/utils";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Asia/Riyadh",
  "Asia/Dubai",
];

interface ClassDraft {
  name: string;
  color: string;
  teacher: string;
}

const STEPS = ["Basics", "Study time", "Classes"] as const;

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [school, setSchool] = useState("");
  const [timezone, setTimezone] = useState("");
  const [goals, setGoals] = useState("");

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set(),
  );

  const [classes, setClasses] = useState<ClassDraft[]>([
    { name: "", color: DEFAULT_CLASS_COLOR, teacher: "" },
  ]);

  useEffect(() => {
    // Reading the browser's timezone during render (instead of here) would
    // differ from the server-rendered markup and trigger a hydration
    // mismatch, since the server doesn't know the visitor's timezone.
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detected) setTimezone(detected);
  }, []);

  const timezoneOptions = useMemo(() => {
    if (!timezone || COMMON_TIMEZONES.includes(timezone)) {
      return COMMON_TIMEZONES;
    }
    return [timezone, ...COMMON_TIMEZONES];
  }, [timezone]);

  function togglePreset(id: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateClass(index: number, patch: Partial<ClassDraft>) {
    setClasses((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  function addClassRow() {
    if (classes.length >= 12) return;
    setClasses((prev) => [
      ...prev,
      { name: "", color: DEFAULT_CLASS_COLOR, teacher: "" },
    ]);
  }

  function removeClassRow(index: number) {
    setClasses((prev) => prev.filter((_, i) => i !== index));
  }

  function canAdvance(): boolean {
    if (step === 0) return displayName.trim().length > 0 && timezone.length > 0;
    return true;
  }

  function handleFinish() {
    const availability = Array.from(selectedPresets).flatMap(presetToWindows);
    const validClasses = classes
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        name: c.name.trim(),
        color: c.color,
        teacher: c.teacher.trim() || undefined,
      }));

    startTransition(async () => {
      const result = await completeOnboarding({
        displayName: displayName.trim(),
        grade: grade ? Number(grade) : null,
        school: school.trim() || undefined,
        timezone,
        goals: goals.trim() || undefined,
        availability,
        classes: validClasses,
      });
      if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h1 className="font-heading text-2xl font-semibold">
            Let&apos;s set up your plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Takes about a minute. Nothing here is shared with anyone.
          </p>

          <div className="space-y-2">
            <Label htmlFor="displayName">What should we call you?</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="First name or nickname"
              maxLength={60}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grade">Grade</Label>
              <Select value={grade} onValueChange={(v) => setGrade(v ?? "")}>
                <SelectTrigger id="grade">
                  <SelectValue placeholder="Prefer not to say" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9">9th</SelectItem>
                  <SelectItem value="10">10th</SelectItem>
                  <SelectItem value="11">11th</SelectItem>
                  <SelectItem value="12">12th</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v ?? "")}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone">
                    {(value: string | null) =>
                      value ? value.replace(/_/g, " ") : "Select timezone"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">School (optional)</Label>
            <Input
              id="school"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goals">Academic goals (optional)</Label>
            <Textarea
              id="goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="e.g. Bring my chemistry grade up, stay ahead on AP Lang reading"
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h1 className="font-heading text-2xl font-semibold">
            When can you usually study?
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick as many as apply. You can fine-tune this later in Settings.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AVAILABILITY_PRESETS.map((preset) => {
              const selected = selectedPresets.has(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(preset.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    selected
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
          {selectedPresets.size === 0 && (
            <p className="text-sm text-muted-foreground">
              No windows selected yet — Rushd will still track deadlines, but
              can&apos;t suggest when to work on them.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="font-heading text-2xl font-semibold">Add your classes</h1>
          <p className="text-sm text-muted-foreground">
            Optional — you can always add these later from your dashboard.
          </p>
          <div className="space-y-3">
            {classes.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex gap-1 pt-2.5">
                  {CLASS_COLORS.slice(0, 4).map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      aria-label={`Color ${color.name}`}
                      aria-pressed={c.color === color.value}
                      onClick={() => updateClass(i, { color: color.value })}
                      className={cn(
                        "h-5 w-5 rounded-full ring-offset-2 ring-offset-background",
                        c.color === color.value && "ring-2 ring-ring",
                      )}
                      style={{ backgroundColor: color.value }}
                    />
                  ))}
                </div>
                <Input
                  value={c.name}
                  onChange={(e) => updateClass(i, { name: e.target.value })}
                  placeholder="e.g. AP Chemistry"
                  maxLength={80}
                  aria-label="Class name"
                  className="flex-1"
                />
                <Input
                  value={c.teacher}
                  onChange={(e) => updateClass(i, { teacher: e.target.value })}
                  placeholder="Teacher (optional)"
                  maxLength={80}
                  aria-label="Teacher"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeClassRow(i)}
                  aria-label="Remove class"
                  disabled={classes.length === 1}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addClassRow}>
            + Add another class
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvance()}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={handleFinish} disabled={pending}>
            {pending ? "Setting up…" : "Go to dashboard"}
          </Button>
        )}
      </div>
    </div>
  );
}
