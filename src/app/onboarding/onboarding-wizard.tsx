"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
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
import { clearTry, readFreshTry } from "@/lib/try/storage";
import type { TryItem } from "@/lib/try/parse-week";
import { importTriedWeek } from "@/server/actions/try-week";
import { setEmailReminders } from "@/server/actions/settings";
import {
  AVAILABILITY_PRESETS,
  formatMinutes,
  presetToWindows,
} from "@/lib/planning/availability-presets";
import { SESSION_LENGTH_OPTIONS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { CLASS_COLORS, DEFAULT_CLASS_COLOR } from "@/lib/class-colors";
import { CHALLENGE_OPTIONS, type AcademicChallengeValue } from "@/lib/validation/onboarding";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};
const hasTriedWeek = () => readFreshTry() !== null;

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

const STEPS = ["Basics", "Study time", "Classes", "Challenge"] as const;

export function OnboardingWizard({ teams = false, ai = false, email = false }: { teams?: boolean; ai?: boolean; email?: boolean }) {
  // Came from "Rank my week" on the homepage: lead with adding that week.
  const fromTry = useSyncExternalStore(noopSubscribe, hasTriedWeek, () => false);
  const [importing, setImporting] = useState(false);
  const [emailsOn, setEmailsOn] = useState(false);

  // One step: bring in the saved week and land on Today with it ranked.
  async function addTriedWeek() {
    setImporting(true);
    try {
      const raw = readFreshTry();
      const items = raw ? ((JSON.parse(raw) as { items?: TryItem[] }).items ?? []) : [];
      if (items.length > 0) {
        const r = await importTriedWeek(items.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes })));
        if ("error" in r) {
          toast.error(r.error);
          setImporting(false);
          return;
        }
      }
      clearTry();
      router.push("/dashboard");
    } catch {
      setImporting(false);
      router.push("/dashboard");
    }
  }
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{
    classCount: number;
    availabilityWindowCount: number;
  } | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [school, setSchool] = useState("");
  const [timezone, setTimezone] = useState("");
  const [goals, setGoals] = useState("");
  const [challenge, setChallenge] = useState<AcademicChallengeValue | "">("");

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set(),
  );
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);

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
        primaryChallenge: challenge || null,
        availability,
        classes: validClasses,
        preferredSessionMinutes: sessionMinutes as 30 | 45 | 60 | 90,
      });
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      if (result) {
        setDone({
          classCount: result.classCount,
          availabilityWindowCount: result.availabilityWindowCount,
        });
      }
    });
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <Check className="h-5 w-5 text-accent-foreground" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
            Your Rushd profile is ready.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {done.classCount > 0
              ? `${done.classCount} course${done.classCount === 1 ? "" : "s"} added`
              : "No courses yet, add them anytime"}
            {done.availabilityWindowCount > 0
              ? " and your study time is set."
              : ". Set your study availability in Settings to get a real plan."}
          </p>
          {email && (
            <label className="mx-auto mt-4 flex max-w-md items-start gap-2.5 text-left text-sm">
              <input
                type="checkbox"
                checked={emailsOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setEmailsOn(on);
                  void setEmailReminders(on);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--signal)]"
              />
              <span>
                Email me my week every Sunday, and a nudge if a study streak is about to end.{" "}
                <span className="text-muted-foreground">Change it anytime in Settings.</span>
              </span>
            </label>
          )}
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Pick a first step. Connecting Canvas brings in your assignments, due dates, and course materials (read-only).
            {ai ? " Or check a page of practice work to see what you've got down and what to review." : " Or go straight to your plan and type in what's due."}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          {fromTry && (
            <Button onClick={addTriedWeek} disabled={importing} size="lg" className="w-full sm:w-auto">
              {importing ? "Adding your week…" : "Add the week I ranked"}
            </Button>
          )}
          <Button
            onClick={() => router.push("/integrations/canvas?from=onboarding")}
            size="lg"
            variant={fromTry ? "outline" : "default"}
            className="w-full sm:w-auto"
          >
            Connect Canvas
          </Button>
          {ai && (
            <Button onClick={() => router.push("/practice")} size="lg" variant="outline" className="w-full sm:w-auto">
              Check my work
            </Button>
          )}
          <Button onClick={() => router.push("/dashboard")} size="lg" variant="ghost" className="w-full sm:w-auto">
            Go to my plan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {teams && (
            <>
              Use Microsoft Teams?{" "}
              <a href="/integrations/teams" className="underline underline-offset-4">Connect Teams</a>.{" "}
            </>
          )}
          School turned Canvas tokens off?{" "}
          <a href="/integrations/canvas-calendar" className="underline underline-offset-4">Use your calendar feed</a>.
        </p>
      </div>
    );
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
        {/* Progress as the Rushd path: done points in ink, the current one lit. */}
        <div className="relative flex items-center justify-between" aria-hidden="true">
          <span className="absolute inset-x-1.5 top-1/2 h-px -translate-y-1/2 bg-border" />
          <span
            className="absolute left-1.5 top-1/2 h-px -translate-y-1/2 bg-foreground transition-[width] duration-500 ease-[var(--ease-settle)]"
            style={{ width: `calc(${(step / (STEPS.length - 1)) * 100}% - ${step === STEPS.length - 1 ? 12 : 6}px)` }}
          />
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "relative z-10 rounded-full border-2 transition-all duration-300",
                i < step ? "h-2.5 w-2.5 border-foreground bg-foreground" : i === step ? "h-3.5 w-3.5 border-signal bg-signal" : "h-2.5 w-2.5 border-foreground/25 bg-background",
              )}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
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
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
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
                    {preset.days.length === 5 ? "Mon-Fri" : "Sat-Sun"}, {formatMinutes(preset.startMinute)} to{" "}
                    {formatMinutes(preset.endMinute)}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedPresets.size === 0 && (
            <p className="text-sm text-muted-foreground">
              No windows selected yet. Rushd will still track deadlines, but
              can&apos;t place study time without them.
            </p>
          )}
          <fieldset className="space-y-2 pt-4">
            <legend className="text-sm font-medium">How long do you like to focus at a time?</legend>
            <p className="text-sm text-muted-foreground">
              Rushd sizes study blocks to this, with a short break in between.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SESSION_LENGTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={sessionMinutes === m}
                  onClick={() => setSessionMinutes(m)}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 font-mono text-sm tabular-nums transition-colors",
                    sessionMinutes === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Add your courses</h1>
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
                  aria-label="Remove course"
                  disabled={classes.length === 1}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addClassRow}>
            + Add another course
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
            What&apos;s your biggest academic challenge?
          </h1>
          <p className="text-sm text-muted-foreground">
            Optional — this just helps Rushd&apos;s Academic Profile page make sense of your patterns.
          </p>
          <div className="space-y-2">
            {CHALLENGE_OPTIONS.map((c) => {
              const selected = challenge === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChallenge((cur) => (cur === c.value ? "" : c.value))}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    selected
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{c.label}</div>
                  <div className="text-muted-foreground">{c.body}</div>
                </button>
              );
            })}
          </div>
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
            {pending ? "Setting up…" : "Finish setup"}
          </Button>
        )}
      </div>
    </div>
  );
}
