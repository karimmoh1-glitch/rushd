"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, FileUp, ListTree, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ConfirmSummary, SyllabusPreview } from "@/lib/syllabus/service";
import { previewSyllabusAction } from "@/server/actions/syllabus";
import { SyllabusReview } from "./syllabus-review";

// Syllabus import, start to finish: upload or paste → Rushd reads it → the
// student reviews and edits every row → confirm → a summary with links. The
// same component runs on the course page and inside <SyllabusImportEntry />.

const MAX_FILE_BYTES = 3_500_000;
const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

type Stage = { name: "input" } | { name: "reading" } | { name: "review"; preview: SyllabusPreview } | { name: "done"; summary: ConfirmSummary };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function DoneView({ summary, classId, onAnother, compact }: { summary: ConfirmSummary; classId: string; onAnother: () => void; compact: boolean }) {
  const added = [
    summary.assignments ? plural(summary.assignments, "assignment") : null,
    summary.exams ? plural(summary.exams, "exam") : null,
    summary.topics ? plural(summary.topics, "topic") : null,
  ].filter(Boolean);
  const skipped = [
    summary.duplicatesSkipped ? `${plural(summary.duplicatesSkipped, "duplicate")} of work already in Rushd` : null,
    summary.topicsSkipped ? `${plural(summary.topicsSkipped, "topic")} already in your topic map` : null,
  ].filter(Boolean);
  return (
    <div role="status" className="space-y-4 rounded-2xl bg-card px-4 py-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-6">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-1 h-5 w-5 shrink-0 text-done" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Syllabus imported</h2>
          <p className="text-sm">{added.length > 0 ? `Added ${added.join(", ")} from your syllabus.` : "Nothing new was added."}</p>
          {skipped.length > 0 && <p className="text-sm text-muted-foreground">Skipped {skipped.join(" and ")}.</p>}
          {summary.courseUpdated.length > 0 && <p className="text-sm text-muted-foreground">Updated this course&apos;s {summary.courseUpdated.join(", ")}.</p>}
          {summary.topicNote && <p className="text-sm">Topics weren&apos;t added: {summary.topicNote}</p>}
          <p className="text-sm text-muted-foreground">The syllabus text is saved to this course, so the tutor and course search can use it.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!compact && (
          <Link href={`/courses/${classId}`} className={buttonVariants({ variant: "signal" })}>
            Open the course
          </Link>
        )}
        <Link href="/plan" className={buttonVariants({ variant: "outline" })}>
          See your updated plan
        </Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Today
        </Link>
        <Link href={`/courses/${classId}/material/${summary.materialId}`} className={buttonVariants({ variant: "ghost" })}>
          Read the saved syllabus
        </Link>
        <Button variant="ghost" onClick={onAnother}>
          Import another
        </Button>
      </div>
    </div>
  );
}

export function SyllabusImport({
  classId,
  compact = false,
  onComplete,
}: {
  classId: string;
  /** Smaller headings, for embedding in another flow (e.g. onboarding). */
  compact?: boolean;
  onComplete?: (summary: ConfirmSummary) => void;
}) {
  const [stage, setStage] = useState<Stage>({ name: "input" });
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rereading, startReread] = useTransition();
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function read(form: FormData) {
    setError(null);
    setStage({ name: "reading" });
    startTransition(async () => {
      const result = await previewSyllabusAction(form);
      if (result.status === "error") {
        setError(result.error);
        setStage({ name: "input" });
        return;
      }
      setStage({ name: "review", preview: result.preview });
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("classId", classId);
    if (mode === "file") {
      if (!file) {
        setError("Choose your syllabus file first.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("That file is over the 3.5 MB limit. Upload just the syllabus, or paste the text.");
        return;
      }
      form.set("file", file);
    } else {
      if (text.trim().length < 40) {
        setError("Paste the whole syllabus — that's too short to read.");
        return;
      }
      form.set("text", text);
    }
    read(form);
  }

  function reread(preview: SyllabusPreview, termStart: string) {
    const form = new FormData();
    form.set("classId", classId);
    form.set("text", preview.text);
    form.set("termStart", termStart);
    startReread(async () => {
      const result = await previewSyllabusAction(form);
      if (result.status === "error") {
        setError(result.error);
        return;
      }
      // Keep what the student knows about the file.
      setStage({ name: "review", preview: { ...result.preview, sourceName: preview.sourceName, pages: preview.pages } });
    });
  }

  function chooseFile(list: FileList | null) {
    const chosen = list?.[0] ?? null;
    setError(null);
    setFile(chosen);
  }

  if (stage.name === "reading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-signal border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
          Reading your syllabus…
        </p>
      </div>
    );
  }

  if (stage.name === "review") {
    return (
      <>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <SyllabusReview
          key={stage.preview.text.length + (stage.preview.current.termStart ?? "") + stage.preview.draft.assessments.map((a) => a.date).join()}
          preview={stage.preview}
          rereading={rereading}
          onReread={(termStart) => reread(stage.preview, termStart)}
          onStartOver={() => setStage({ name: "input" })}
          onDone={(summary) => {
            setStage({ name: "done", summary });
            onComplete?.(summary);
          }}
        />
      </>
    );
  }

  if (stage.name === "done") {
    return (
      <DoneView
        summary={stage.summary}
        classId={classId}
        compact={compact}
        onAnother={() => {
          setFile(null);
          setText("");
          setStage({ name: "input" });
        }}
      />
    );
  }

  const Heading = compact ? "h3" : "h2";
  return (
    <form onSubmit={submit} className="space-y-5" aria-labelledby="syllabus-import-heading">
      <div className="space-y-1.5">
        <Heading id="syllabus-import-heading" className={cn("font-medium tracking-tight", compact ? "text-base font-semibold" : "font-display text-2xl")}>
          Import your syllabus
        </Heading>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Upload your syllabus or paste its text. Rushd finds the assessments, dates, weekly topics and learning objectives — then shows you every row,
          with where it came from, before anything is saved.
        </p>
      </div>

      <ul className="grid max-w-3xl gap-2 text-sm sm:grid-cols-3">
        <li className="flex items-start gap-2">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Assignments and exams, with their dates
        </li>
        <li className="flex items-start gap-2">
          <ListTree className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Topics for your topic map
        </li>
        <li className="flex items-start gap-2">
          <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          The text, for the tutor and search
        </li>
      </ul>

      <div role="radiogroup" aria-label="How to add your syllabus" className="inline-flex rounded-full bg-muted p-1">
        {(
          [
            ["file", "Upload a file"],
            ["paste", "Paste text"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-(--dur-press) sm:h-8",
              mode === value ? "bg-background text-foreground shadow-(--shadow-card)" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div className="max-w-2xl space-y-2">
          <Label htmlFor="syllabus-file">Syllabus file</Label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              chooseFile(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors duration-(--dur-ui)",
              dragOver ? "border-signal bg-signal-soft/50" : "border-border-strong bg-surface-2/50",
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            {file ? (
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="max-w-[16rem] truncate">{file.name}</span>
                <span className="text-muted-foreground">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
                <button type="button" onClick={() => setFile(null)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Remove file">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Drop a PDF, Word (.docx) or text file here</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              {file ? "Choose a different file" : "Choose file"}
            </Button>
            <input ref={fileInput} id="syllabus-file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => chooseFile(e.target.files)} />
          </div>
          <p className="text-xs text-muted-foreground">Up to 3.5 MB and 40 pages. Scanned PDFs (images of text) can&apos;t be read — paste the text instead.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-2">
          <Label htmlFor="syllabus-text">Syllabus text</Label>
          <Textarea
            id="syllabus-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder={"Paste the whole syllabus: the schedule, the assessments, the grading section…"}
            className="max-h-[50vh] min-h-48 font-mono text-[13px] leading-relaxed"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="max-w-2xl text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="signal">
          Read syllabus
        </Button>
        <p className="max-w-md text-xs text-muted-foreground">
          The file is read in memory and not kept. If you confirm, the extracted text is saved to this course.
        </p>
      </div>
    </form>
  );
}
