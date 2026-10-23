"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoursePicker } from "@/components/course/course-picker";
import { completeOnboarding, recordOnboardingLevel } from "@/server/actions/onboarding";
import { clearTry, readFreshTry } from "@/lib/try/storage";
import type { TryItem } from "@/lib/try/parse-week";
import { AVAILABILITY_PRESETS, formatMinutes, presetToWindows } from "@/lib/planning/availability-presets";
import { SESSION_LENGTH_OPTIONS } from "@/lib/planning/constants";
import { formatDuration } from "@/lib/format";
import { COURSE_LEVELS, catalogRecord, levelLabel, type CourseLevelValue } from "@/lib/courses/catalog";
import { colorFor, pickCustom, provenanceLabel, toClassInput, type CourseDetails, type PickedCourse } from "@/lib/courses/picked";
import { parseWork, toDrafts, type WorkDraft } from "@/lib/onboarding/work";
import { ONBOARDING_MAX_WORK } from "@/lib/validation/onboarding-setup";
import type { ClassInput } from "@/lib/validation/classes";
import { cn } from "@/lib/utils";

// Onboarding, short and useful: level → courses → optional details → work →
// study time, then the first plan and Today. Only the level and one course
// (or an explicit skip) are needed; every other step can be skipped.

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

const STEPS = ["Level", "Courses", "Details", "Your work", "Study time"] as const;
const LEVEL = 0;
const COURSES = 1;
const DETAILS = 2;
const WORK = 3;
const TIME = 4;
const LAST_STEP = STEPS.length - 1;

interface DetailDraft {
  institution: string;
  code: string;
  termStart: string;
  termEnd: string;
  weeklyHours: string;
}

const EMPTY_DETAILS: DetailDraft = { institution: "", code: "", termStart: "", termEnd: "", weeklyHours: "" };

function readTriedWeekItems(): TryItem[] {
  try {
    const raw = readFreshTry();
    if (!raw) return [];
    const items = (JSON.parse(raw) as { items?: TryItem[] }).items;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

// ---------- Progress ----------

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
          <span key={name} className={cn("relative z-10 rounded-full border-2 transition-all duration-300", stepDotClass(index, step))} />
        ))}
      </div>
    </div>
  );
}

function StepHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight sm:text-[2rem]">{title}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

// ---------- Step 1: Level ----------

function LevelStep({
  displayName,
  setDisplayName,
  level,
  setLevel,
  timezone,
  setTimezone,
}: {
  displayName: string;
  setDisplayName: (value: string) => void;
  level: CourseLevelValue | null;
  setLevel: (value: CourseLevelValue) => void;
  timezone: string;
  setTimezone: (value: string) => void;
}) {
  const timezoneOptions = useMemo(() => (!timezone || COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES]), [timezone]);

  return (
    <div className="space-y-6">
      <StepHeading title="Let's set up your plan">About a minute. You&apos;ll pick your level and courses, and Rushd plans from there.</StepHeading>

      <div className="space-y-2">
        <Label htmlFor="displayName">What should we call you? (optional)</Label>
        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="First name or nickname" maxLength={60} autoFocus className="h-10" />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">What level do you study at?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COURSE_LEVELS.map((option) => {
            const checked = level === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative flex min-h-[4.25rem] cursor-pointer flex-col justify-center rounded-xl border px-3 py-2.5 text-sm transition-[border-color,background-color] duration-(--dur-press) has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  checked ? "border-signal bg-signal-soft" : "border-border hover:border-border-strong hover:bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name="study-level"
                  value={option.value}
                  checked={checked}
                  onChange={() => setLevel(option.value)}
                  aria-labelledby={`level-name-${option.value}`}
                  aria-describedby={`level-hint-${option.value}`}
                  // Invisible but covering the card, so a tap anywhere picks it.
                  className="absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-xl opacity-0"
                />
                <span id={`level-name-${option.value}`} className="font-medium">
                  {option.label}
                </span>
                <span id={`level-hint-${option.value}`} className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {option.hint}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Label htmlFor="timezone" className="text-muted-foreground">
          Time zone
        </Label>
        <Select value={timezone} onValueChange={(v) => setTimezone(v ?? "")}>
          <SelectTrigger id="timezone" className="min-w-52">
            <SelectValue placeholder="Select timezone">{(value: string | null) => (value ? value.replace(/_/g, " ") : "Select timezone")}</SelectValue>
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
  );
}

// ---------- Step 3: Details ----------

function provenanceFor(course: PickedCourse): string {
  const record = catalogRecord(course.catalogId);
  return provenanceLabel(course, record?.provider);
}

function provenanceNote(course: PickedCourse): string {
  if (course.kind === "template") return "A generic template: Rushd doesn't know your school's version. Your code, term, and work make it yours.";
  if (course.kind === "official") return "The official course name. Your teacher's pacing and assignments are yours to add.";
  return "Your own course, exactly as you named it.";
}

function DetailsStep({
  courses,
  details,
  setDetail,
  sharedSchool,
  setSharedSchool,
  sharedStart,
  setSharedStart,
  sharedEnd,
  setSharedEnd,
}: {
  courses: PickedCourse[];
  details: Record<string, DetailDraft>;
  setDetail: (key: string, patch: Partial<DetailDraft>) => void;
  sharedSchool: string;
  setSharedSchool: (value: string) => void;
  sharedStart: string;
  setSharedStart: (value: string) => void;
  sharedEnd: string;
  setSharedEnd: (value: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <StepHeading title="Any details? All optional">Your school and term help Rushd pace the plan. Skip anything you don&apos;t know yet.</StepHeading>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="shared-school">Your school (used for every course)</Label>
          <Input id="shared-school" value={sharedSchool} onChange={(e) => setSharedSchool(e.target.value)} placeholder="e.g. Lincoln High School" maxLength={120} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shared-term-start">This term starts</Label>
          <Input id="shared-term-start" type="date" value={sharedStart} onChange={(e) => setSharedStart(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shared-term-end">This term ends</Label>
          <Input id="shared-term-end" type="date" value={sharedEnd} onChange={(e) => setSharedEnd(e.target.value)} className="h-10" />
        </div>
        <p className="self-end text-xs text-muted-foreground">Applies to every course unless you set one below.</p>
      </div>

      <ul className="space-y-2">
        {courses.map((course, index) => {
          const isOpen = open.has(course.key);
          const draft = details[course.key] ?? EMPTY_DETAILS;
          const panelId = `details-${index}`;
          return (
            <li key={course.key} style={{ ["--course" as string]: colorFor(index) }} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 p-3 pl-4">
                <span aria-hidden="true" className="course-rule h-8 w-1 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{course.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{[levelLabel(course.level), provenanceFor(course)].filter(Boolean).join(" · ")}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => toggle(course.key)} aria-expanded={isOpen} aria-controls={panelId} className="h-9 shrink-0">
                  {isOpen ? "Done" : "Add details"}
                  <span className="sr-only"> for {course.title}</span>
                  <ChevronDown className={cn("transition-transform duration-(--dur-ui)", isOpen && "rotate-180")} aria-hidden="true" />
                </Button>
              </div>
              {isOpen && (
                <div id={panelId} role="group" aria-label={`Details for ${course.title}`} className="space-y-4 border-t border-border px-4 pb-4 pt-3">
                  <p className="text-xs text-muted-foreground">{provenanceNote(course)}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${panelId}-school`}>School</Label>
                      <Input id={`${panelId}-school`} value={draft.institution} onChange={(e) => setDetail(course.key, { institution: e.target.value })} placeholder={sharedSchool || "e.g. Lincoln High School"} maxLength={120} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${panelId}-code`}>Course code</Label>
                      <Input id={`${panelId}-code`} value={draft.code} onChange={(e) => setDetail(course.key, { code: e.target.value })} placeholder="As your school writes it" maxLength={30} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${panelId}-start`}>Term starts</Label>
                      <Input id={`${panelId}-start`} type="date" value={draft.termStart} onChange={(e) => setDetail(course.key, { termStart: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${panelId}-end`}>Term ends</Label>
                      <Input id={`${panelId}-end`} type="date" value={draft.termEnd} onChange={(e) => setDetail(course.key, { termEnd: e.target.value })} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${panelId}-hours`}>Weekly study goal</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`${panelId}-hours`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={40}
                        step={1}
                        value={draft.weeklyHours}
                        onChange={(e) => setDetail(course.key, { weeklyHours: e.target.value })}
                        className="h-10 w-24"
                        aria-describedby={`${panelId}-hours-unit`}
                      />
                      <span id={`${panelId}-hours-unit`} className="text-sm text-muted-foreground">
                        hours a week
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Step 4: Work ----------

function dueLabel(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timeZone || undefined });
  } catch {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
}

function WorkStep({
  courses,
  items,
  setItems,
  text,
  setText,
  onAddText,
  timezone,
  connectCanvas,
  setConnectCanvas,
  fromTry,
}: {
  courses: PickedCourse[];
  items: WorkDraft[];
  setItems: (update: (items: WorkDraft[]) => WorkDraft[]) => void;
  text: string;
  setText: (value: string) => void;
  onAddText: () => void;
  timezone: string;
  connectCanvas: boolean;
  setConnectCanvas: (value: boolean) => void;
  fromTry: boolean;
}) {
  const full = items.length >= ONBOARDING_MAX_WORK;
  return (
    <div className="space-y-6">
      <StepHeading title="What's due soon?">
        Assignments, quizzes, and exams, one per line. Start a line with the course if you like: &ldquo;Chem: lab report Thursday 2h&rdquo;.
        {fromTry && " We brought in the week you ranked."}
      </StepHeading>

      <div className="space-y-2">
        <Label htmlFor="onboarding-work">Assignments and exams, one per line</Label>
        <textarea
          id="onboarding-work"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={2400}
          spellCheck={false}
          disabled={full}
          placeholder={"Chem: lab report Thursday 2h\nCalc quiz Friday\nEnglish essay draft Monday 3h"}
          className="block w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.7] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Lines without a day get a week; you can change it later.</p>
          <Button type="button" variant="outline" onClick={onAddText} disabled={!text.trim() || full}>
            Add to my list
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <ul aria-label="Work to add" className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((item) => {
            const courseValue = "index" in item.course ? String(item.course.index) : `new:${item.course.newName}`;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind === "exam" ? "Test" : "Assignment"} · {item.assumedDate ? "No day found, due in a week" : `Due ${dueLabel(item.dueAt, timezone)}`} · {formatDuration(item.minutes)}
                  </p>
                </div>
                <select
                  aria-label={`Course for ${item.title}`}
                  value={courseValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setItems((current) =>
                      current.map((draft) => (draft.id === item.id ? { ...draft, course: value.startsWith("new:") ? { newName: value.slice(4) } : { index: Number(value) } } : draft)),
                    );
                  }}
                  className="h-9 max-w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {courses.map((course, index) => (
                    <option key={course.key} value={String(index)}>
                      {course.title}
                    </option>
                  ))}
                  {"newName" in item.course && <option value={`new:${item.course.newName}`}>New course: {item.course.newName}</option>}
                </select>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.title}`} onClick={() => setItems((current) => current.filter((draft) => draft.id !== item.id))}>
                  <X aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <label className="flex items-start gap-2.5 rounded-xl border border-border p-3.5 text-sm">
        <input type="checkbox" checked={connectCanvas} onChange={(e) => setConnectCanvas(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--signal)]" />
        <span>
          <span className="font-medium">My school uses Canvas: connect it after setup</span>
          <span className="block text-muted-foreground">Brings in assignments, due dates, and course materials (read-only).</span>
        </span>
      </label>
    </div>
  );
}

// ---------- Step 5: Study time ----------

function StudyTimeStep({
  selectedPresets,
  onTogglePreset,
  sessionMinutes,
  setSessionMinutes,
  email,
  emailsOn,
  setEmailsOn,
}: {
  selectedPresets: Set<string>;
  onTogglePreset: (id: string) => void;
  sessionMinutes: number;
  setSessionMinutes: (minutes: number) => void;
  email: boolean;
  emailsOn: boolean;
  setEmailsOn: (on: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <StepHeading title="When can you usually study?">Pick as many as apply. You can fine-tune this later in Settings.</StepHeading>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {AVAILABILITY_PRESETS.map((preset) => {
          const selected = selectedPresets.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onTogglePreset(preset.id)}
              aria-pressed={selected}
              className={cn("rounded-lg border px-4 py-3 text-left text-sm transition-colors", selected ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted")}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-muted-foreground">
                {preset.days.length === 5 ? "Mon-Fri" : "Sat-Sun"}, {formatMinutes(preset.startMinute)} to {formatMinutes(preset.endMinute)}
              </div>
            </button>
          );
        })}
      </div>
      {selectedPresets.size === 0 && (
        <p className="text-sm text-muted-foreground">No windows selected yet. Rushd will still rank what&apos;s due, but can&apos;t place study time without them.</p>
      )}
      <fieldset className="space-y-2 pt-4">
        <legend className="text-sm font-medium">How long do you like to focus at a time?</legend>
        <p className="text-sm text-muted-foreground">Rushd sizes study blocks to this, with a short break in between.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SESSION_LENGTH_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={sessionMinutes === minutes}
              onClick={() => setSessionMinutes(minutes)}
              className={cn(
                "rounded-lg border px-3.5 py-2 font-mono text-sm tabular-nums transition-colors",
                sessionMinutes === minutes ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {formatDuration(minutes)}
            </button>
          ))}
        </div>
      </fieldset>
      {email && (
        <label className="flex items-start gap-2.5 pt-2 text-sm">
          <input type="checkbox" checked={emailsOn} onChange={(e) => setEmailsOn(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--signal)]" />
          <span>
            Email me my week every Sunday, and a nudge if a study streak is about to end. <span className="text-muted-foreground">Change it anytime in Settings.</span>
          </span>
        </label>
      )}
    </div>
  );
}

// ---------- The wizard ----------

export interface OnboardingWizardProps {
  teams?: boolean;
  email?: boolean;
  /** Catalog ids enough real students chose (thresholded on the server). */
  popularIds?: string[];
}

export function OnboardingWizard({ email = false, popularIds = [] }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(LEVEL);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const loggedLevel = useRef<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [level, setLevel] = useState<CourseLevelValue | null>(null);

  const [courses, setCourses] = useState<PickedCourse[]>([]);
  const [details, setDetails] = useState<Record<string, DetailDraft>>({});
  const [sharedSchool, setSharedSchool] = useState("");
  const [sharedStart, setSharedStart] = useState("");
  const [sharedEnd, setSharedEnd] = useState("");

  const [workText, setWorkText] = useState("");
  const [work, setWork] = useState<WorkDraft[]>([]);
  const [fromTry, setFromTry] = useState(false);
  const [connectCanvas, setConnectCanvas] = useState(false);

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);
  const [emailsOn, setEmailsOn] = useState(false);

  // Browser-only values are read after mounting so the first render matches the server's.
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTimezone(detected);
    const tried = readTriedWeekItems();
    if (tried.length > 0) {
      setFromTry(true);
      setWork(toDrafts(tried.slice(0, ONBOARDING_MAX_WORK), []));
    }
  }, []);

  const workCourses = courses.map((course) => ({ title: course.title, catalogId: course.catalogId }));

  function addCourse(course: PickedCourse) {
    setCourses((current) => (current.some((c) => c.key === course.key) ? current : [...current, course]));
  }

  function removeCourse(key: string) {
    const index = courses.findIndex((course) => course.key === key);
    if (index < 0) return;
    setCourses((current) => current.filter((course) => course.key !== key));
    // Work pointing at the removed course moves to the first remaining one (or a new course).
    setWork((current) =>
      current.map((item) => {
        if (!("index" in item.course)) return item;
        if (item.course.index === index) return { ...item, course: courses.length > 1 ? { index: 0 } : { newName: courses[index].title } };
        if (item.course.index > index) return { ...item, course: { index: item.course.index - 1 } };
        return item;
      }),
    );
  }

  /** Re-matches work that was waiting for a course (e.g. the homepage week) once courses exist. */
  function rematchWork() {
    setWork((current) =>
      current.map((item) => {
        if (!("newName" in item.course)) return item;
        const [matched] = toDrafts([{ kind: item.kind, title: item.title, className: item.course.newName, dueAt: item.dueAt, minutes: item.minutes, assumedDate: item.assumedDate }], workCourses);
        return { ...item, course: matched.course };
      }),
    );
  }

  function addWorkText() {
    const parsed = parseWork(workText, workCourses, new Date());
    if (parsed.length === 0) return;
    setWork((current) => [...current, ...parsed].slice(0, ONBOARDING_MAX_WORK));
    setWorkText("");
  }

  function setDetail(key: string, patch: Partial<DetailDraft>) {
    setDetails((current) => ({ ...current, [key]: { ...(current[key] ?? EMPTY_DETAILS), ...patch } }));
  }

  function togglePreset(id: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function detailsFor(course: PickedCourse): CourseDetails {
    const draft = details[course.key] ?? EMPTY_DETAILS;
    const hours = Number(draft.weeklyHours);
    return {
      institution: draft.institution.trim() || sharedSchool.trim() || undefined,
      code: draft.code.trim() || undefined,
      termStart: draft.termStart || sharedStart || undefined,
      termEnd: draft.termEnd || sharedEnd || undefined,
      weeklyHours: draft.weeklyHours && Number.isFinite(hours) ? hours : undefined,
    };
  }

  /** A problem with the details that would stop setup, or null. */
  function detailsProblem(): string | null {
    for (const course of courses) {
      const d = detailsFor(course);
      if (d.termStart && d.termEnd && d.termEnd < d.termStart) return `${course.title}: the term can't end before it starts.`;
      if (d.weeklyHours !== undefined && (!Number.isInteger(d.weeklyHours) || d.weeklyHours < 1 || d.weeklyHours > 40)) return `${course.title}: weekly study goal should be 1 to 40 whole hours.`;
    }
    return null;
  }

  function goTo(next: number) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function goNext() {
    if (step === LEVEL && level && loggedLevel.current !== level) {
      loggedLevel.current = level;
      void recordOnboardingLevel(level);
    }
    if (step === COURSES) {
      rematchWork();
      goTo(courses.length > 0 ? DETAILS : WORK);
      return;
    }
    if (step === DETAILS) {
      const problem = detailsProblem();
      if (problem) {
        setError(problem);
        return;
      }
    }
    if (step === WORK && workText.trim()) addWorkText();
    goTo(Math.min(LAST_STEP, step + 1));
  }

  function goBack() {
    if (step === WORK && courses.length === 0) goTo(COURSES);
    else goTo(Math.max(LEVEL, step - 1));
  }

  function canAdvance(): boolean {
    if (step === LEVEL) return level !== null && timezone.length > 0;
    if (step === COURSES) return courses.length > 0;
    return true;
  }

  function handleFinish() {
    setError(null);
    // Work assigned to a new course adds that course (once per name) after the picked ones.
    const allCourses: ClassInput[] = courses.map((course, index) => toClassInput(course, colorFor(index), detailsFor(course)));
    const newIndex = new Map<string, number>();
    const workInput = work.map((item) => {
      let courseIndex: number;
      if ("index" in item.course) {
        courseIndex = item.course.index;
      } else {
        const name = item.course.newName;
        const existing = newIndex.get(name.toLowerCase());
        if (existing !== undefined) {
          courseIndex = existing;
        } else {
          courseIndex = allCourses.length;
          newIndex.set(name.toLowerCase(), courseIndex);
          allCourses.push(toClassInput(pickCustom(name, level), colorFor(courseIndex), { institution: sharedSchool.trim() || undefined, termStart: sharedStart || undefined, termEnd: sharedEnd || undefined }));
        }
      }
      return { kind: item.kind, title: item.title, courseIndex, dueAt: item.dueAt, minutes: item.minutes };
    });

    startTransition(async () => {
      const response = await completeOnboarding({
        displayName: displayName.trim(),
        studyLevel: level,
        school: sharedSchool.trim() || undefined,
        timezone,
        availability: Array.from(selectedPresets).flatMap(presetToWindows),
        courses: allCourses,
        work: workInput,
        preferredSessionMinutes: sessionMinutes as 30 | 45 | 60 | 90,
        emailReminders: emailsOn,
      });
      if ("error" in response) {
        setError(response.error);
        toast.error(response.error);
        return;
      }
      if (fromTry) clearTry();
      router.push(connectCanvas ? "/integrations/canvas?from=onboarding" : "/dashboard");
    });
  }

  return (
    <div className="space-y-8">
      <StepProgress step={step} />

      {step === LEVEL && (
        <LevelStep displayName={displayName} setDisplayName={setDisplayName} level={level} setLevel={setLevel} timezone={timezone} setTimezone={setTimezone} />
      )}

      {step === COURSES && (
        <div className="space-y-5">
          <StepHeading title="Add your courses">
            Search and add as many as you take. Can&apos;t find one? Create it. AP and IB courses are the official ones; everything else is a generic template until you add your school&apos;s details.
          </StepHeading>
          <CoursePicker studentLevel={level} selected={courses} onAdd={addCourse} onRemove={removeCourse} popularIds={popularIds} autoFocus />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {courses.length === 0 ? "No courses yet." : courses.length === 1 ? "1 course added." : `${courses.length} courses added.`}
          </p>
        </div>
      )}

      {step === DETAILS && (
        <DetailsStep
          courses={courses}
          details={details}
          setDetail={setDetail}
          sharedSchool={sharedSchool}
          setSharedSchool={setSharedSchool}
          sharedStart={sharedStart}
          setSharedStart={setSharedStart}
          sharedEnd={sharedEnd}
          setSharedEnd={setSharedEnd}
        />
      )}

      {step === WORK && (
        <WorkStep
          courses={courses}
          items={work}
          setItems={setWork}
          text={workText}
          setText={setWorkText}
          onAddText={addWorkText}
          timezone={timezone}
          connectCanvas={connectCanvas}
          setConnectCanvas={setConnectCanvas}
          fromTry={fromTry}
        />
      )}

      {step === TIME && (
        <StudyTimeStep
          selectedPresets={selectedPresets}
          onTogglePreset={togglePreset}
          sessionMinutes={sessionMinutes}
          setSessionMinutes={setSessionMinutes}
          email={email}
          emailsOn={emailsOn}
          setEmailsOn={setEmailsOn}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-6">
        <Button type="button" variant="ghost" onClick={goBack} disabled={step === LEVEL || pending}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step === COURSES && courses.length === 0 && (
            <Button type="button" variant="ghost" onClick={goNext}>
              Skip for now
            </Button>
          )}
          {(step === DETAILS || step === WORK) && (
            <Button type="button" variant="ghost" onClick={() => goTo(step + 1)} className="hidden sm:inline-flex">
              Skip
            </Button>
          )}
          {step < LAST_STEP ? (
            <Button type="button" onClick={goNext} disabled={!canAdvance()} size="lg">
              Continue
            </Button>
          ) : (
            <Button type="button" variant="signal" onClick={handleFinish} disabled={pending} size="lg">
              {pending ? "Building your plan…" : "Finish setup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
