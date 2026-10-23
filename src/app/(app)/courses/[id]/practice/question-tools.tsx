"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SubjectProfile } from "@/lib/learning/subjects";
import { createQuestionAction, generateQuestionsAction, removeQuestionAction, reportQuestionAction } from "@/server/actions/learning";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30";

function AddQuestionForm({
  courseId,
  topics,
  profile,
  onDone,
}: {
  courseId: string;
  topics: { id: string; title: string }[];
  profile: SubjectProfile;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [hint, setHint] = useState("");
  const [difficulty, setDifficulty] = useState(2);
  const mono = profile.format === "code" ? "font-mono" : "";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createQuestionAction({
        classId: courseId,
        topicId: topicId || null,
        prompt,
        answer,
        explanation: explanation || null,
        hints: hint.trim() ? [hint] : [],
        difficulty,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add your own question</DialogTitle>
        <DialogDescription>Something you want to be able to answer: from class, homework, or your notes.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="q-topic">Topic</Label>
        <select id="q-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} className={selectClass}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
          <option value="">No topic</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-prompt">{profile.promptLabel}</Label>
        <Textarea id="q-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={profile.promptPlaceholder} maxLength={2000} className={mono} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-answer">{profile.answerLabel}</Label>
        <Textarea id="q-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={profile.answerPlaceholder} maxLength={3000} className={mono} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-hint">Hint (optional)</Label>
        <Input id="q-hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="A nudge that doesn't give the answer away" maxLength={300} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-explanation">Explanation (optional)</Label>
        <Textarea id="q-explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Why it's right, or the mistake to avoid" maxLength={2000} />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Difficulty</legend>
        <div className="flex gap-1.5">
          {[
            [1, "Easier"],
            [2, "Standard"],
            [3, "Harder"],
          ].map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={difficulty === value ? "default" : "outline"} aria-pressed={difficulty === value} onClick={() => setDifficulty(value as number)}>
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="submit" disabled={pending || !prompt.trim() || !answer.trim()}>
          {pending ? "Adding…" : "Add question"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddQuestionButton({ courseId, topics, profile }: { courseId: string; topics: { id: string; title: string }[]; profile: SubjectProfile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a question
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">{open && <AddQuestionForm courseId={courseId} topics={topics} profile={profile} onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

export function GenerateQuestionsButton({ courseId, topicId }: { courseId: string; topicId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function generate() {
    startTransition(async () => {
      const result = await generateQuestionsAction({ classId: courseId, topicId });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.ids.length} generated question${result.ids.length === 1 ? "" : "s"}. Check them against your notes.`);
      router.refresh();
    });
  }
  return (
    <Button variant="ghost" size="sm" onClick={generate} disabled={pending}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {pending ? "Generating…" : "Generate questions"}
    </Button>
  );
}

const REASONS = [
  ["wrong_answer", "The answer is wrong"],
  ["unclear", "The question is unclear"],
  ["off_topic", "Not about this topic or course"],
  ["other", "Something else"],
] as const;

/** "Report a problem" for a generated question. Hides it for this student. */
export function ReportQuestionDialog({
  open,
  onOpenChange,
  courseId,
  questionId,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  questionId: string;
  onReported?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("wrong_answer");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await reportQuestionAction({ classId: courseId, questionId, reason, note: note || undefined });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Thanks. That question is hidden from your practice.");
      onOpenChange(false);
      onReported?.();
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Report a problem</DialogTitle>
            <DialogDescription>The question will be hidden from your practice. Your report helps check the generator.</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1">
            <legend className="sr-only">What&apos;s wrong?</legend>
            {REASONS.map(([value, label]) => (
              <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted/60">
                <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="h-4 w-4 accent-[var(--signal)]" />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="report-note">Details (optional)</Label>
            <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Report and hide"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuestionActions({ courseId, questionId, generated }: { courseId: string; questionId: string; generated: boolean }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [pending, startTransition] = useTransition();
  if (generated) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Report a problem
        </Button>
        <ReportQuestionDialog open={reporting} onOpenChange={setReporting} courseId={courseId} questionId={questionId} />
      </>
    );
  }
  function remove() {
    startTransition(async () => {
      const result = await removeQuestionAction({ classId: courseId, questionId });
      if ("error" in result) toast.error(result.error);
      router.refresh();
    });
  }
  return (
    <Button variant="ghost" size="icon-sm" onClick={remove} disabled={pending} aria-label="Remove question">
      <Trash2 />
    </Button>
  );
}
