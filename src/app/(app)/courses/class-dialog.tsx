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
import { createClass, createClasses, updateClass } from "@/server/actions/classes";
import { CLASS_COLORS, DEFAULT_CLASS_COLOR } from "@/lib/class-colors";
import { PRIORITY_LABELS } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { ClassInput } from "@/lib/validation/classes";
import { COURSE_LEVELS, catalogRecord, levelLabel, type CatalogRecord, type CourseLevelValue } from "@/lib/courses/catalog";
import { normalize } from "@/lib/courses/catalog/search";
import { colorFor, toClassInput, type PickedCourse } from "@/lib/courses/picked";
import { CoursePicker, type OwnCourseSummary } from "@/components/course/course-picker";
import { CourseSearch } from "./course-search";

export interface ClassDialogInitialData extends ClassInput {
  id: string;
}

/** What the add dialog knows about the student, for ranking and the multi-course picker. */
export interface CourseContext {
  studentLevel: CourseLevelValue | null;
  popularIds: string[];
  ownCourses: OwnCourseSummary[];
}

const NO_LEVEL = "NONE";

function submitLabel(pending: boolean, editing: boolean): string {
  if (pending) return "Saving…";
  if (editing) return "Save changes";
  return "Add course";
}

export function ClassDialog({
  open,
  onOpenChange,
  initialData,
  timeZone,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ClassDialogInitialData;
  /** The student's time zone, which term dates and plans use. */
  timeZone?: string;
  context?: CourseContext;
}) {
  // Adding offers a multi-course mode; editing is always one course.
  const [multi, setMulti] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMulti(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {multi && !initialData ? (
          <MultiCourseForm context={context} onDone={() => onOpenChange(false)} onSingle={() => setMulti(false)} />
        ) : (
          /* The key gives each course (or "new") its own fresh form state. */
          <ClassDialogForm
            key={initialData?.id ?? "new"}
            initialData={initialData}
            timeZone={timeZone}
            studentLevel={context?.studentLevel ?? null}
            onDone={() => onOpenChange(false)}
            onMulti={initialData ? undefined : () => setMulti(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Add several courses at once with the command-palette picker. */
function MultiCourseForm({ context, onDone, onSingle }: { context?: CourseContext; onDone: () => void; onSingle: () => void }) {
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<PickedCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const existing = context?.ownCourses.filter((course) => !course.archived).length ?? 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (picked.length === 0) return;
    setError(null);
    const inputs = picked.map((course, index) => toClassInput(course, colorFor(existing + index)));
    startTransition(async () => {
      const result = await createClasses(inputs);
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(picked.length === 1 ? "Course added." : `${picked.length} courses added.`);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Add courses</DialogTitle>
        <DialogDescription>Add as many as you like. Details like your school and term can be added to each course after.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-4">
        <CoursePicker
          studentLevel={context?.studentLevel ?? null}
          selected={picked}
          onAdd={(course) => setPicked((current) => (current.some((c) => c.key === course.key) ? current : [...current, course]))}
          onRemove={(key) => setPicked((current) => current.filter((course) => course.key !== key))}
          popularIds={context?.popularIds}
          ownCourses={context?.ownCourses}
          autoFocus
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" onClick={onSingle}>
          Add one with details
        </Button>
        <Button type="submit" disabled={pending || picked.length === 0}>
          {pending ? "Adding…" : picked.length > 1 ? `Add ${picked.length} courses` : "Add course"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ClassDialogForm({
  initialData,
  timeZone,
  studentLevel,
  onDone,
  onMulti,
}: {
  initialData?: ClassDialogInitialData;
  timeZone?: string;
  studentLevel: CourseLevelValue | null;
  onDone: () => void;
  onMulti?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialData?.name ?? "");
  const [teacher, setTeacher] = useState(initialData?.teacher ?? "");
  const [period, setPeriod] = useState(initialData?.period ?? "");
  const [color, setColor] = useState<string>(initialData?.color ?? DEFAULT_CLASS_COLOR);
  const [priority, setPriority] = useState<ClassInput["priority"]>(initialData?.priority ?? "MEDIUM");
  const [level, setLevel] = useState<CourseLevelValue | null>(initialData?.level ?? null);
  const [code, setCode] = useState(initialData?.code ?? "");
  const [institution, setInstitution] = useState(initialData?.institution ?? "");
  const [subject, setSubject] = useState(initialData?.subject ?? "");
  const [termStart, setTermStart] = useState(initialData?.termStart ?? "");
  const [termEnd, setTermEnd] = useState(initialData?.termEnd ?? "");
  const [weeklyHours, setWeeklyHours] = useState(initialData?.weeklyHours ? String(initialData.weeklyHours) : "");
  const [catalogId, setCatalogId] = useState<string | null>(initialData?.catalogId ?? null);
  const [error, setError] = useState<string | null>(null);

  // Picking a suggestion fills in what we know about that course.
  function pickCourse(course: CatalogRecord, shownLevel: CourseLevelValue) {
    setName(course.title);
    setSubject(course.subject);
    setCatalogId(course.id);
    if (!level) setLevel(shownLevel);
  }

  function changeName(next: string) {
    setName(next);
    // A new course whose name no longer contains the picked title is a custom course.
    const picked = catalogRecord(catalogId);
    if (!initialData && picked && !normalize(next).includes(normalize(picked.title))) setCatalogId(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input: ClassInput = {
      name,
      teacher: teacher || undefined,
      period: period || undefined,
      color,
      priority,
      level: level ?? undefined,
      code,
      institution,
      subject,
      termStart,
      termEnd,
      weeklyHours: weeklyHours ? Number(weeklyHours) : undefined,
      catalogId: catalogId ?? undefined,
    };

    startTransition(async () => {
      let result;
      if (initialData) {
        result = await updateClass(initialData.id, input);
      } else {
        result = await createClass(input);
      }

      if ("error" in result) {
        // Shown next to the form as well as in a toast, so screen readers hear it.
        setError(result.error);
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
          Search for your course or type your own. Only the name is required.
          {onMulti && (
            <>
              {" "}
              <button type="button" onClick={onMulti} className="font-medium text-foreground underline underline-offset-4">
                Add several at once
              </button>
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="class-level">Level</Label>
          <Select value={level ?? NO_LEVEL} onValueChange={(value) => setLevel(!value || value === NO_LEVEL ? null : (value as CourseLevelValue))}>
            <SelectTrigger id="class-level">
              <SelectValue>{(value: string) => (value === NO_LEVEL ? "Not set" : levelLabel(value as CourseLevelValue))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LEVEL}>Not set</SelectItem>
              {COURSE_LEVELS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-name">Course</Label>
          <CourseSearch value={name} level={level ?? studentLevel} onChange={changeName} onPick={pickCourse} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="class-code">Course code (optional)</Label>
            <Input id="class-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. CHEM 101" maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class-subject">Subject (optional)</Label>
            <Input id="class-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Science" maxLength={60} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="class-institution">School (optional)</Label>
          <Input
            id="class-institution"
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            placeholder="e.g. Lincoln High School"
            maxLength={120}
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

        <details className="rounded-lg border border-border px-3 py-2" open={Boolean(termStart || termEnd || weeklyHours)}>
          <summary className="cursor-pointer text-sm font-medium">Term and study time (optional)</summary>
          <div className="space-y-4 pb-1 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="class-term-start">Term starts</Label>
                <Input id="class-term-start" type="date" value={termStart} onChange={(event) => setTermStart(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-term-end">Term ends</Label>
                <Input id="class-term-end" type="date" value={termEnd} onChange={(event) => setTermEnd(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-weekly-hours">Study time you want for this course</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="class-weekly-hours"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={40}
                  step={1}
                  value={weeklyHours}
                  onChange={(event) => setWeeklyHours(event.target.value)}
                  className="w-24"
                  aria-describedby="class-weekly-hours-unit"
                />
                <span id="class-weekly-hours-unit" className="text-sm text-muted-foreground">hours a week</span>
              </div>
            </div>
            {timeZone && (
              <p className="text-xs text-muted-foreground">
                Dates use your time zone ({timeZone}). You can change it in Settings.
              </p>
            )}
          </div>
        </details>

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

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {submitLabel(pending, Boolean(initialData))}
        </Button>
      </DialogFooter>
    </form>
  );
}
