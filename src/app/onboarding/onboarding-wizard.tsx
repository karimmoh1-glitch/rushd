"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

const STEPS = ["Basics", "Study time", "Classes", "Challenge"] as const;
const LAST_STEP = STEPS.length - 1;
const MAX_CLASSES = 12;

interface ClassDraft {
  name: string;
  color: string;
  teacher: string;
}

interface SetupResult {
  classCount: number;
  availabilityWindowCount: number;
}

function emptyClass(): ClassDraft {
  return { name: "", color: DEFAULT_CLASS_COLOR, teacher: "" };
}

// The items from the week saved on the homepage, or [] if there is none.
function readTriedWeekItems(): TryItem[] {
  const raw = readFreshTry();
  if (!raw) return [];
  return (JSON.parse(raw) as { items?: TryItem[] }).items ?? [];
}

// ---------- Progress bar ----------

function progressLineWidth(step: number): string {
  const percent = (step / LAST_STEP) * 100;
  const inset = step === LAST_STEP ? 12 : 6;
  return `calc(${percent}% - ${inset}px)`;
}

function stepDotClass(index: number, step: number): string {
  if (index < step) return "h-2.5 w-2.5 border-foreground bg-foreground";
  if (index === step) return "h-3.5 w-3.5 border-signal bg-signal";
  return "h-2.5 w-2.5 border-foreground/25 bg-background";
}

function StepProgress({ step }: { step: number }) {
  return (
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
          style={{ width: progressLineWidth(step) }}
        />
        {STEPS.map((name, index) => (
          <span
            key={name}
            className={cn(
              "relative z-10 rounded-full border-2 transition-all duration-300",
              stepDotClass(index, step),
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Step 1: Basics ----------

function BasicsStep({
  displayName,
  setDisplayName,
  grade,
  setGrade,
  timezone,
  setTimezone,
  school,
  setSchool,
  goals,
  setGoals,
}: {
  displayName: string;
  setDisplayName: (value: string) => void;
  grade: string;
  setGrade: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  school: string;
  setSchool: (value: string) => void;
  goals: string;
  setGoals: (value: string) => void;
}) {
  // Show the detected timezone too, even if it isn't one of the common ones.
  const timezoneOptions = useMemo(() => {
    if (!timezone || COMMON_TIMEZONES.includes(timezone)) {
      return COMMON_TIMEZONES;
    }
    return [timezone, ...COMMON_TIMEZONES];
  }, [timezone]);

  return (
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
  );
}

// ---------- Step 2: Study time ----------

function StudyTimeStep({
  selectedPresets,
  onTogglePreset,
  sessionMinutes,
  setSessionMinutes,
}: {
  selectedPresets: Set<string>;
  onTogglePreset: (id: string) => void;
  sessionMinutes: number;
  setSessionMinutes: (minutes: number) => void;
}) {
  return (
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
              onClick={() => onTogglePreset(preset.id)}
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
          {SESSION_LENGTH_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={sessionMinutes === minutes}
              onClick={() => setSessionMinutes(minutes)}
              className={cn(
                "rounded-lg border px-3.5 py-2 font-mono text-sm tabular-nums transition-colors",
                sessionMinutes === minutes
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ---------- Step 3: Classes ----------

function ClassesStep({
  classes,
  onUpdateClass,
  onRemoveClass,
  onAddClass,
}: {
  classes: ClassDraft[];
  onUpdateClass: (index: number, patch: Partial<ClassDraft>) => void;
  onRemoveClass: (index: number) => void;
  onAddClass: () => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Add your courses</h1>
      <p className="text-sm text-muted-foreground">
        Optional — you can always add these later from your dashboard.
      </p>
      <div className="space-y-3">
        {classes.map((course, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex gap-1 pt-2.5">
              {CLASS_COLORS.slice(0, 4).map((color) => (
                <button
                  key={color.value}
                  type="button"
                  aria-label={`Color ${color.name}`}
                  aria-pressed={course.color === color.value}
                  onClick={() => onUpdateClass(index, { color: color.value })}
                  className={cn(
                    "h-5 w-5 rounded-full ring-offset-2 ring-offset-background",
                    course.color === color.value && "ring-2 ring-ring",
                  )}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <Input
              value={course.name}
              onChange={(e) => onUpdateClass(index, { name: e.target.value })}
              placeholder="e.g. AP Chemistry"
              maxLength={80}
              aria-label="Class name"
              className="flex-1"
            />
            <Input
              value={course.teacher}
              onChange={(e) => onUpdateClass(index, { teacher: e.target.value })}
              placeholder="Teacher (optional)"
              maxLength={80}
              aria-label="Teacher"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemoveClass(index)}
              aria-label="Remove course"
              disabled={classes.length === 1}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAddClass}>
        + Add another course
      </Button>
    </div>
  );
}

// ---------- Step 4: Challenge ----------

function ChallengeStep({
  challenge,
  onPickChallenge,
}: {
  challenge: AcademicChallengeValue | "";
  onPickChallenge: (value: AcademicChallengeValue) => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">
        What&apos;s your biggest academic challenge?
      </h1>
      <p className="text-sm text-muted-foreground">
        Optional — this just helps Rushd&apos;s Academic Profile page make sense of your patterns.
      </p>
      <div className="space-y-2">
        {CHALLENGE_OPTIONS.map((option) => {
          const selected = challenge === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPickChallenge(option.value)}
              aria-pressed={selected}
              className={cn(
                "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-muted-foreground">{option.body}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Finished screen ----------

function DoneScreen({
  result,
  teams,
  ai,
  email,
  fromTry,
  importing,
  onAddTriedWeek,
}: {
  result: SetupResult;
  teams: boolean;
  ai: boolean;
  email: boolean;
  fromTry: boolean;
  importing: boolean;
  onAddTriedWeek: () => void;
}) {
  const router = useRouter();
  const [emailsOn, setEmailsOn] = useState(false);

  function handleEmailsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const on = e.target.checked;
    setEmailsOn(on);
    void setEmailReminders(on);
  }

  let coursesText = "No courses yet, add them anytime";
  if (result.classCount > 0) {
    coursesText = result.classCount === 1 ? "1 course added" : `${result.classCount} courses added`;
  }

  let studyTimeText = ". Set your study availability in Settings to get a real plan.";
  if (result.availabilityWindowCount > 0) {
    studyTimeText = " and your study time is set.";
  }

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
          {coursesText}
          {studyTimeText}
        </p>
        {email && (
          <label className="mx-auto mt-4 flex max-w-md items-start gap-2.5 text-left text-sm">
            <input
              type="checkbox"
              checked={emailsOn}
              onChange={handleEmailsChange}
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
          <Button onClick={onAddTriedWeek} disabled={importing} size="lg" className="w-full sm:w-auto">
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

// ---------- The wizard ----------

export function OnboardingWizard({ teams = false, ai = false, email = false }: { teams?: boolean; ai?: boolean; email?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SetupResult | null>(null);

  // Came from "Rank my week" on the homepage: lead with adding that week.
  const [fromTry, setFromTry] = useState(false);
  const [importing, setImporting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [school, setSchool] = useState("");
  const [timezone, setTimezone] = useState("");
  const [goals, setGoals] = useState("");
  const [challenge, setChallenge] = useState<AcademicChallengeValue | "">("");

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);

  const [classes, setClasses] = useState<ClassDraft[]>([emptyClass()]);

  // Browser-only values are read after mounting so the first render matches the server's.
  useEffect(() => {
    setFromTry(readFreshTry() !== null);
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTimezone(detected);
  }, []);

  // One step: bring in the saved week and land on Today with it ranked.
  async function addTriedWeek() {
    setImporting(true);
    try {
      const items = readTriedWeekItems();
      if (items.length > 0) {
        const importResult = await importTriedWeek(
          items.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes })),
        );
        if ("error" in importResult) {
          toast.error(importResult.error);
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

  function togglePreset(id: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateClass(index: number, patch: Partial<ClassDraft>) {
    setClasses((prev) => prev.map((course, i) => (i === index ? { ...course, ...patch } : course)));
  }

  function addClassRow() {
    if (classes.length >= MAX_CLASSES) return;
    setClasses((prev) => [...prev, emptyClass()]);
  }

  function removeClassRow(index: number) {
    setClasses((prev) => prev.filter((_, i) => i !== index));
  }

  // Clicking the selected challenge again clears it.
  function pickChallenge(value: AcademicChallengeValue) {
    setChallenge((current) => (current === value ? "" : value));
  }

  function canAdvance(): boolean {
    if (step === 0) return displayName.trim().length > 0 && timezone.length > 0;
    return true;
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1));
  }

  function goNext() {
    setStep((current) => Math.min(LAST_STEP, current + 1));
  }

  function handleFinish() {
    const availability = Array.from(selectedPresets).flatMap(presetToWindows);
    const validClasses = classes
      .filter((course) => course.name.trim().length > 0)
      .map((course) => ({
        name: course.name.trim(),
        color: course.color,
        teacher: course.teacher.trim() || undefined,
      }));

    startTransition(async () => {
      const response = await completeOnboarding({
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
      if (response && "error" in response) {
        toast.error(response.error);
        return;
      }
      if (response) {
        setResult({
          classCount: response.classCount,
          availabilityWindowCount: response.availabilityWindowCount,
        });
      }
    });
  }

  if (result) {
    return (
      <DoneScreen
        result={result}
        teams={teams}
        ai={ai}
        email={email}
        fromTry={fromTry}
        importing={importing}
        onAddTriedWeek={addTriedWeek}
      />
    );
  }

  return (
    <div className="space-y-8">
      <StepProgress step={step} />

      {step === 0 && (
        <BasicsStep
          displayName={displayName}
          setDisplayName={setDisplayName}
          grade={grade}
          setGrade={setGrade}
          timezone={timezone}
          setTimezone={setTimezone}
          school={school}
          setSchool={setSchool}
          goals={goals}
          setGoals={setGoals}
        />
      )}

      {step === 1 && (
        <StudyTimeStep
          selectedPresets={selectedPresets}
          onTogglePreset={togglePreset}
          sessionMinutes={sessionMinutes}
          setSessionMinutes={setSessionMinutes}
        />
      )}

      {step === 2 && (
        <ClassesStep
          classes={classes}
          onUpdateClass={updateClass}
          onRemoveClass={removeClassRow}
          onAddClass={addClassRow}
        />
      )}

      {step === 3 && <ChallengeStep challenge={challenge} onPickChallenge={pickChallenge} />}

      <div className="flex items-center justify-between border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          disabled={step === 0 || pending}
        >
          Back
        </Button>
        {step < LAST_STEP ? (
          <Button type="button" onClick={goNext} disabled={!canAdvance()}>
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
