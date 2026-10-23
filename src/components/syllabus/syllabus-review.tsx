"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Quote, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatKey } from "@/lib/syllabus/dates";
import { ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABEL, isUncertain, type AssessmentType, type DraftAssessment, type DraftField, type DraftTopic, type SourceRef } from "@/lib/syllabus/types";
import { includedByDefault, savedAs } from "@/lib/syllabus/review";
import type { SyllabusPreview, ConfirmSummary } from "@/lib/syllabus/service";
import type { ConfirmSyllabusInput } from "@/lib/syllabus/confirm-schema";
import { confirmSyllabusAction } from "@/server/actions/syllabus";
import { ConfidenceBadge } from "./confidence-badge";

// The preview the student checks before anything is saved: assessments,
// topics and schedule, and course details, each row editable, each with how
// sure Rushd is and the line of the syllabus it came from. Uncertain rows
// start excluded; duplicates of existing work start skipped.

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm sm:h-8 dark:bg-input/30";

interface AssessmentRow {
  id: string;
  include: boolean;
  title: string;
  type: AssessmentType;
  date: string;
  weight: string;
  /** The student set the date on an uncertain row. */
  fixed: boolean;
  original: DraftAssessment;
  duplicate: SyllabusPreview["duplicates"][string] | null;
}

interface TopicRowState {
  id: string;
  include: boolean;
  title: string;
  original: DraftTopic;
  existing: boolean;
}

type CourseKey = "code" | "instructor" | "termStart" | "termEnd";

function SourceToggle({ source, id }: { source: SourceRef; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-source`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0"
      >
        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? "Hide source" : "Show source"}
      </button>
      {open && (
        <blockquote id={`${id}-source`} className="mt-1.5 rounded-lg border-l-2 border-border-strong bg-surface-2 px-3 py-2 text-xs leading-relaxed">
          <span className="block text-muted-foreground">{source.line ? `Line ${source.line} of your syllabus` : "Not found in your syllabus text"}</span>
          <span className="mt-0.5 block whitespace-pre-wrap break-words font-mono text-[12px] text-foreground">{source.snippet}</span>
        </blockquote>
      )}
    </div>
  );
}

function Issues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue} className="flex gap-1.5 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-soon" aria-hidden="true" />
          <span>{issue}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({ id, title, count, children }: { id: string; title: string; count: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
      <div>
        <h3 id={id} className="text-base font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{count}</p>
      </div>
      {children && <div className="flex gap-1.5">{children}</div>}
    </div>
  );
}

function AssessmentItem({ row, today, onChange }: { row: AssessmentRow; today: string; onChange: (patch: Partial<AssessmentRow>) => void }) {
  const id = useId();
  const uncertain = isUncertain(row.original) && !row.fixed;
  const noDate = !row.date;
  const past = Boolean(row.date) && row.date < today;
  return (
    <li>
      <fieldset
        className={cn(
          "rounded-xl px-3 py-3 ring-1 transition-[opacity,background-color] duration-(--dur-ui) sm:px-4",
          uncertain ? "bg-card ring-soon/55 shadow-[inset_3px_0_0_0_var(--status-soon)]" : "bg-card ring-foreground/[0.07]",
        )}
      >
        <legend className="sr-only">{row.original.title}</legend>
        <div className="flex items-start gap-3">
          <Checkbox
            checked={row.include}
            disabled={noDate}
            onCheckedChange={(checked) => onChange({ include: checked === true })}
            aria-label={`Include ${row.title || row.original.title}`}
            className="mt-2.5"
          />
          <div className="row-body min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Title" maxLength={160} className="min-w-0 flex-1 basis-56 font-medium" />
              <ConfidenceBadge confidence={row.fixed ? "high" : row.original.confidence} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9.5rem_10.5rem_6.5rem]">
              <div className="space-y-1">
                <Label htmlFor={`${id}-type`} className="text-xs font-normal text-muted-foreground">
                  Type
                </Label>
                <select id={`${id}-type`} value={row.type} onChange={(e) => onChange({ type: e.target.value as AssessmentType })} className={selectClass}>
                  {ASSESSMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ASSESSMENT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-date`} className="text-xs font-normal text-muted-foreground">
                  Date
                </Label>
                <Input
                  id={`${id}-date`}
                  type="date"
                  value={row.date}
                  onChange={(e) => {
                    const date = e.target.value;
                    const wasUncertain = isUncertain(row.original);
                    // Setting the date on a flagged row is the student's fix: include it.
                    onChange({ date, fixed: wasUncertain && Boolean(date), include: date ? (wasUncertain ? !row.duplicate : row.include) : false });
                  }}
                />
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-1">
                <Label htmlFor={`${id}-weight`} className="text-xs font-normal text-muted-foreground">
                  Weight (%)
                </Label>
                <Input id={`${id}-weight`} type="number" inputMode="decimal" min={0} max={100} step="any" value={row.weight} onChange={(e) => onChange({ weight: e.target.value })} placeholder="—" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saved as {savedAs(row.type) === "exam" ? "an exam" : "an assignment"}
              {row.original.time ? ` · ${formatTime(row.original.time)} in your syllabus` : ""}
              {row.original.dateText ? ` · written as “${row.original.dateText}”` : ""}
            </p>
            {row.fixed ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-done" aria-hidden="true" />
                You set the date.
              </p>
            ) : (
              <Issues issues={row.original.issues} />
            )}
            {row.duplicate && (
              <p className="text-sm">
                Already in Rushd: “{row.duplicate.title}” on {formatKey(row.duplicate.date)}. {row.include ? "It will be added again." : "Skipped — tick it to add it anyway."}
              </p>
            )}
            {!row.include && uncertain && !row.duplicate && <p className="text-xs text-muted-foreground">{noDate ? "Add a date to include it." : "Left out until you fix the date or include it."}</p>}
            {!row.include && !uncertain && !row.duplicate && past && <p className="text-xs text-muted-foreground">This date has passed, so it&apos;s left out. Tick it to add it anyway.</p>}
            <SourceToggle source={row.original.source} id={id} />
          </div>
        </div>
      </fieldset>
    </li>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function TopicItem({ row, onChange }: { row: TopicRowState; onChange: (patch: Partial<TopicRowState>) => void }) {
  const id = useId();
  const t = row.original;
  const meta = [
    t.week ? `Week ${t.week}` : null,
    t.startDate ? (t.endDate && t.endDate !== t.startDate ? `${formatKey(t.startDate)} – ${formatKey(t.endDate)}` : formatKey(t.startDate)) : null,
    t.readings ? `Reading: ${t.readings}` : null,
  ].filter(Boolean);
  const uncertain = isUncertain(t);
  return (
    <li className={cn(t.parentTitle && "pl-6 sm:pl-8")}>
      <fieldset className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 sm:px-4", uncertain ? "bg-card ring-soon/55 shadow-[inset_3px_0_0_0_var(--status-soon)]" : "bg-card ring-foreground/[0.07]")}>
        <legend className="sr-only">{t.title}</legend>
        <Checkbox
          checked={row.include}
          disabled={row.existing}
          onCheckedChange={(checked) => onChange({ include: checked === true })}
          aria-label={`Include topic ${row.title || t.title}`}
          className="mt-2.5"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Topic name" maxLength={120} disabled={row.existing} className="min-w-0 flex-1 basis-48" />
            <ConfidenceBadge confidence={t.confidence} />
          </div>
          {(meta.length > 0 || t.parentTitle) && (
            <p className="text-xs text-muted-foreground">
              {t.parentTitle ? `Inside ${t.parentTitle}` : ""}
              {t.parentTitle && meta.length ? " · " : ""}
              {meta.join(" · ")}
            </p>
          )}
          {row.existing && <p className="text-xs text-muted-foreground">Already in your topic map.</p>}
          <Issues issues={t.issues} />
          <SourceToggle source={t.source} id={id} />
        </div>
      </fieldset>
    </li>
  );
}

function CourseRow({
  label,
  field,
  current,
  checked,
  value,
  type,
  onTick,
  onValue,
}: {
  label: string;
  field: DraftField;
  current: string | null;
  checked: boolean;
  value: string;
  type: "text" | "date";
  onTick: (checked: boolean) => void;
  onValue: (value: string) => void;
}) {
  const id = useId();
  return (
    <li>
      <fieldset className="flex items-start gap-3 rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/[0.07] sm:px-4">
        <legend className="sr-only">{label}</legend>
        <Checkbox checked={checked} onCheckedChange={(c) => onTick(c === true)} aria-label={`Save ${label.toLowerCase()} to this course`} className="mt-2.5" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <Label htmlFor={`${id}-value`} className="text-sm font-medium">
              {label}
            </Label>
            <Input id={`${id}-value`} type={type} value={value} onChange={(e) => onValue(e.target.value)} className="sm:max-w-xs" />
            <ConfidenceBadge confidence={field.confidence} className="justify-self-start" />
          </div>
          <p className="text-xs text-muted-foreground">
            In Rushd now: {current ? (type === "date" ? formatKey(current, true) : current) : "not set"}. {checked ? "Will be updated." : "Tick to save it."}
          </p>
          <Issues issues={field.issues} />
          <SourceToggle source={field.source} id={id} />
        </div>
      </fieldset>
    </li>
  );
}

function sortRows<T extends { original: { date?: string | null } }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const da = a.row.original.date ?? "9999";
      const db = b.row.original.date ?? "9999";
      return da === db ? a.index - b.index : da < db ? -1 : 1;
    })
    .map(({ row }) => row);
}

export function SyllabusReview({
  preview,
  onDone,
  onStartOver,
  onReread,
  rereading,
}: {
  preview: SyllabusPreview;
  onDone: (summary: ConfirmSummary) => void;
  onStartOver: () => void;
  /** Read the same text again with a term start the student supplies (to place "Week N"). */
  onReread: (termStart: string) => void;
  rereading: boolean;
}) {
  const { draft } = preview;
  const [pending, startTransition] = useTransition();
  const [assessments, setAssessments] = useState<AssessmentRow[]>(() =>
    sortRows(
      draft.assessments.map((a) => ({
        id: a.id,
        include: includedByDefault(a, Boolean(preview.duplicates[a.id]), preview.today),
        title: a.title,
        type: a.type,
        date: a.date ?? "",
        weight: a.weight === null ? "" : String(a.weight),
        fixed: false,
        original: a,
        duplicate: preview.duplicates[a.id] ?? null,
      })),
    ),
  );
  const [topics, setTopics] = useState<TopicRowState[]>(() =>
    draft.topics.map((t) => {
      const existing = preview.existingTopics.includes(t.id);
      return { id: t.id, include: !existing && !isUncertain(t), title: t.title, original: t, existing };
    }),
  );
  const [objectives, setObjectives] = useState(() => draft.objectives.map((o) => ({ ...o, include: o.confidence !== "low" })));
  const [course, setCourse] = useState<Record<CourseKey, { tick: boolean; value: string }>>(() => ({
    code: { tick: false, value: draft.course.code?.value ?? "" },
    instructor: { tick: false, value: draft.course.instructor?.value ?? "" },
    // A week-1 date the student typed is theirs: ticked to save.
    termStart: { tick: Boolean(preview.termStartOverride), value: preview.termStartOverride ?? draft.course.termStart?.value ?? "" },
    termEnd: { tick: false, value: draft.course.termEnd?.value ?? "" },
  }));
  const [rereadStart, setRereadStart] = useState("");

  const counts = useMemo(() => {
    const kept = assessments.filter((a) => a.include);
    return {
      assessments: kept.length,
      uncertain: assessments.filter((a) => isUncertain(a.original) && !a.fixed).length,
      topics: topics.filter((t) => t.include).length,
      objectives: objectives.filter((o) => o.include).length,
    };
  }, [assessments, topics, objectives]);

  const updateAssessment = (id: string, patch: Partial<AssessmentRow>) => setAssessments((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const updateTopic = (id: string, patch: Partial<TopicRowState>) => setTopics((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const tickCourse = (key: CourseKey, patch: Partial<{ tick: boolean; value: string }>) => setCourse((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const weekNote = draft.notes.some((n) => /counts weeks/.test(n)) && !preview.current.termStart;
  const termStartField: DraftField | null = preview.termStartOverride
    ? { value: preview.termStartOverride, confidence: "high", issues: [], source: { line: null, snippet: "You entered this date on the review screen." } }
    : draft.course.termStart;
  const missingCourse = (
    [
      ["course code", draft.course.code],
      ["instructor", draft.course.instructor],
      ["term dates", draft.course.termStart ?? draft.course.termEnd],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([label]) => label);

  function confirm() {
    const kept = assessments.filter((a) => a.include);
    const missingTitle = kept.find((a) => !a.title.trim());
    if (missingTitle) {
      toast.error("Every item you add needs a title.");
      return;
    }
    const missingDate = kept.find((a) => !a.date);
    if (missingDate) {
      toast.error(`Add a date for “${missingDate.title}”, or leave it out.`);
      return;
    }
    const badWeight = kept.find((a) => a.weight !== "" && !(Number(a.weight) >= 0 && Number(a.weight) <= 100));
    if (badWeight) {
      toast.error(`The weight for “${badWeight.title}” should be between 0 and 100.`);
      return;
    }
    const included = topics.filter((t) => t.include && t.title.trim());
    const includedTitles = new Set(included.map((t) => t.original.title));
    const payload: ConfirmSyllabusInput = {
      classId: preview.classId,
      text: preview.text,
      sourceName: preview.sourceName,
      method: draft.method,
      assessments: kept.map((a) => ({
        title: a.title.trim(),
        type: a.type,
        date: a.date,
        time: a.date === a.original.date ? a.original.time : null,
        weight: a.weight === "" ? null : Number(a.weight),
        allowDuplicate: Boolean(a.duplicate),
        snippet: a.original.source.line ? a.original.source.snippet : null,
      })),
      // A subtopic whose parent was left out becomes a top-level topic.
      topics: included.map((t) => ({ title: t.title.trim(), parentTitle: t.original.parentTitle && includedTitles.has(t.original.parentTitle) ? (topics.find((p) => p.original.title === t.original.parentTitle)?.title.trim() ?? null) : null })),
      objectives: objectives.filter((o) => o.include).map((o) => o.text),
      grading: draft.grading.map((g) => ({ label: g.label, weight: g.weight })),
      course: {
        code: course.code.tick && course.code.value.trim() ? course.code.value.trim().slice(0, 40) : null,
        instructor: course.instructor.tick && course.instructor.value.trim() ? course.instructor.value.trim().slice(0, 80) : null,
        termStart: course.termStart.tick && course.termStart.value ? course.termStart.value : null,
        termEnd: course.termEnd.tick && course.termEnd.value ? course.termEnd.value : null,
      },
      excluded: assessments.length - kept.length + topics.filter((t) => !t.include).length,
    };
    if (payload.assessments.length + payload.topics.length + payload.objectives.length === 0 && !Object.values(payload.course).some(Boolean)) {
      toast.error("Nothing is selected. Tick what you want to add.");
      return;
    }
    startTransition(async () => {
      const result = await confirmSyllabusAction(payload);
      if (result.status === "error") {
        toast.error(result.error);
        return;
      }
      onDone(result.summary);
    });
  }

  const methodLine =
    draft.method === "ai"
      ? "Read with AI, then checked line by line against your syllabus."
      : "Read with Rushd's built-in rules (no AI). Check each row — it only knows what the text says.";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-soft px-2.5 py-1 text-xs font-medium text-signal-ink">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            From your syllabus
          </span>
          {preview.sourceName && <span className="text-sm text-muted-foreground">{preview.sourceName}</span>}
          {preview.pages && <span className="text-sm text-muted-foreground">· {preview.pages} page{preview.pages === 1 ? "" : "s"}</span>}
        </div>
        <h2 className="font-display text-2xl font-medium tracking-tight">Check what Rushd found</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {draft.assessments.length} assessment{draft.assessments.length === 1 ? "" : "s"}, {draft.topics.length} topic{draft.topics.length === 1 ? "" : "s"}, and {draft.objectives.length} learning objective
          {draft.objectives.length === 1 ? "" : "s"}. Nothing is saved until you confirm. {methodLine}
        </p>
        {counts.uncertain > 0 && (
          <p className="flex gap-1.5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-soon" aria-hidden="true" />
            {counts.uncertain} item{counts.uncertain === 1 ? " needs" : "s need"} a look and {counts.uncertain === 1 ? "is" : "are"} left out until you fix or include {counts.uncertain === 1 ? "it" : "them"}.
          </p>
        )}
        {preview.truncated && <p className="text-sm">Only the first part of a very long document was read.</p>}
        {draft.notes.length > 0 && (
          <ul className="space-y-1">
            {draft.notes.map((note) => (
              <li key={note} className="flex gap-1.5 text-sm text-muted-foreground">
                <span aria-hidden="true">·</span>
                {note}
              </li>
            ))}
          </ul>
        )}
        {weekNote && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 px-3 py-3 sm:px-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (rereadStart) onReread(rereadStart);
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="reread-term-start">When did (or will) week 1 start?</Label>
              <Input id="reread-term-start" type="date" value={rereadStart} onChange={(e) => setRereadStart(e.target.value)} className="w-44" />
            </div>
            <Button type="submit" variant="outline" disabled={!rereadStart || rereading}>
              {rereading ? "Reading…" : "Place the weeks"}
            </Button>
          </form>
        )}
      </div>

      <section aria-labelledby="review-assessments" className="space-y-3">
        <SectionHeading id="review-assessments" title="Assessments" count={`${counts.assessments} of ${assessments.length} will be added`}>
          {assessments.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setAssessments((rows) => rows.map((r) => ({ ...r, include: Boolean(r.date) && !r.duplicate })))}>
                Include all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAssessments((rows) => rows.map((r) => ({ ...r, include: false })))}>
                Leave all out
              </Button>
            </>
          )}
        </SectionHeading>
        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dated assessments found in your syllabus. You can add them yourself on the Assignments page.</p>
        ) : (
          <ul className="space-y-2.5">
            {assessments.map((row) => (
              <AssessmentItem key={row.id} row={row} today={preview.today} onChange={(patch) => updateAssessment(row.id, patch)} />
            ))}
          </ul>
        )}
        {assessments.length > 0 && <p className="text-xs text-muted-foreground">Study time for each starts at Rushd&apos;s default for its type. You can change it any time.</p>}
      </section>

      <section aria-labelledby="review-topics" className="space-y-3">
        <SectionHeading id="review-topics" title="Topics & schedule" count={`${counts.topics} of ${topics.length} topics will be added to your topic map`}>
          {topics.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setTopics((rows) => rows.map((r) => ({ ...r, include: !r.existing })))}>
                Include all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTopics((rows) => rows.map((r) => ({ ...r, include: false })))}>
                Leave all out
              </Button>
            </>
          )}
        </SectionHeading>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topic list or weekly schedule found. You can add topics yourself in the Topics tab.</p>
        ) : (
          <ul className="space-y-2">
            {topics.map((row) => (
              <TopicItem key={row.id} row={row} onChange={(patch) => updateTopic(row.id, patch)} />
            ))}
          </ul>
        )}
        {objectives.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className="text-sm font-semibold">Learning objectives</h4>
            <ul className="space-y-1.5">
              {objectives.map((objective) => (
                <li key={objective.id} className="flex items-start gap-3 rounded-lg px-1 py-1">
                  <Checkbox
                    checked={objective.include}
                    onCheckedChange={(checked) => setObjectives((rows) => rows.map((o) => (o.id === objective.id ? { ...o, include: checked === true } : o)))}
                    aria-label={`Keep objective: ${objective.text}`}
                    className="mt-0.5"
                  />
                  <span className="text-sm">{objective.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Kept objectives are saved with your syllabus on the course page.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="review-course" className="space-y-3">
        <SectionHeading id="review-course" title="Course details" count="Only what you tick is saved to the course" />
        <ul className="space-y-2">
          {draft.course.title && (
            <li className="rounded-xl bg-card px-3 py-3 text-sm ring-1 ring-foreground/[0.07] sm:px-4">
              Your syllabus calls this course <span className="font-medium">“{draft.course.title.value}”</span>
              {draft.course.title.value.toLowerCase() !== preview.className.toLowerCase() ? <> — in Rushd it&apos;s “{preview.className}”.</> : "."}
              {draft.course.term && <> Term: {draft.course.term.value}.</>}
            </li>
          )}
          {draft.course.code && (
            <CourseRow label="Course code" field={draft.course.code} current={preview.current.code} checked={course.code.tick} value={course.code.value} type="text" onTick={(tick) => tickCourse("code", { tick })} onValue={(value) => tickCourse("code", { value })} />
          )}
          {draft.course.instructor && (
            <CourseRow
              label="Instructor"
              field={draft.course.instructor}
              current={preview.current.teacher}
              checked={course.instructor.tick}
              value={course.instructor.value}
              type="text"
              onTick={(tick) => tickCourse("instructor", { tick })}
              onValue={(value) => tickCourse("instructor", { value })}
            />
          )}
          {termStartField && (
            <CourseRow
              label="Term starts"
              field={termStartField}
              current={preview.current.termStart}
              checked={course.termStart.tick}
              value={course.termStart.value}
              type="date"
              onTick={(tick) => tickCourse("termStart", { tick })}
              onValue={(value) => tickCourse("termStart", { value })}
            />
          )}
          {draft.course.termEnd && (
            <CourseRow
              label="Term ends"
              field={draft.course.termEnd}
              current={preview.current.termEnd}
              checked={course.termEnd.tick}
              value={course.termEnd.value}
              type="date"
              onTick={(tick) => tickCourse("termEnd", { tick })}
              onValue={(value) => tickCourse("termEnd", { value })}
            />
          )}
        </ul>
        {missingCourse.length > 0 && <p className="text-sm text-muted-foreground">Not in your syllabus: {missingCourse.join(", ")}. Rushd leaves those as they are.</p>}
        {draft.grading.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <h4 className="text-sm font-semibold">Grading breakdown</h4>
            <ul className="max-w-md divide-y divide-border text-sm">
              {draft.grading.map((entry) => (
                <li key={`${entry.label}-${entry.weight}`} className="flex justify-between gap-3 py-1.5">
                  <span>{entry.label}</span>
                  <span className="tabular-nums text-muted-foreground">{entry.weight}%</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Saved with your syllabus for reference.</p>
          </div>
        )}
      </section>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md md:bottom-0 sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">
            Adding {counts.assessments} assessment{counts.assessments === 1 ? "" : "s"}, {counts.topics} topic{counts.topics === 1 ? "" : "s"}
            {counts.objectives ? `, ${counts.objectives} objective${counts.objectives === 1 ? "" : "s"}` : ""}.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onStartOver} disabled={pending}>
              Start over
            </Button>
            <Button variant="signal" onClick={confirm} disabled={pending}>
              {pending ? "Adding…" : "Confirm and add"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

