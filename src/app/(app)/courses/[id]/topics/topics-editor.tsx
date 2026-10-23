"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Link2, MessageCircleQuestion, Pencil, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PathEmpty } from "@/components/brand/path-empty";
import { MasteryChip, estimateLine } from "@/components/learning/mastery-chip";
import { StartPracticeButton } from "@/components/learning/start-practice-button";
import type { MasteryStatusV2 } from "@/lib/learning/estimator";
import { cn } from "@/lib/utils";
import {
  addPrerequisiteAction,
  addTopicAction,
  confirmTopicsAction,
  deleteTopicAction,
  dismissTopicsAction,
  moveTopicAction,
  removePrerequisiteAction,
  updateTopicAction,
} from "@/server/actions/learning";

export interface TopicRow {
  id: string;
  title: string;
  parentId: string | null;
  status: MasteryStatusV2;
  explanation: string;
  improve: string | null;
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: string;
  answers: number;
  due: boolean;
  sourceLabel: string;
  prerequisiteIds: string[];
  prerequisiteTitles: string[];
  remediation: { reason: string; topicId: string | null; title: string | null } | null;
}

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm sm:h-8 dark:bg-input/30";

function AddTopicForm({ courseId, parents }: { courseId: string; parents: TopicRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addTopicAction({ classId: courseId, title, parentId: parentId || null });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTitle("");
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="new-topic">New topic</Label>
        <Input id="new-topic" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chain rule" maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-topic-parent">Inside</Label>
        <select id="new-topic-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectClass}>
          <option value="">Top level</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending || !title.trim()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add topic"}
      </Button>
    </form>
  );
}

function ProposedTopics({ courseId, proposed }: { courseId: string; proposed: TopicRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(kind: "confirm" | "dismiss", ids: string[]) {
    startTransition(async () => {
      const result = kind === "confirm" ? await confirmTopicsAction({ classId: courseId, topicIds: ids }) : await dismissTopicsAction({ classId: courseId, topicIds: ids });
      if ("error" in result) toast.error(result.error);
      router.refresh();
    });
  }
  return (
    <section aria-labelledby="proposed-heading" className="rounded-xl bg-card px-4 py-4 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="proposed-heading" className="text-[15px] font-semibold">
            Suggested topics to check
          </h2>
          <p className="text-sm text-muted-foreground">Nothing is added until you confirm it. Keep what matches your actual course.</p>
        </div>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("confirm", proposed.map((p) => p.id))}>
          Confirm all
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {proposed.map((topic) => (
          <li key={topic.id} className={cn("flex flex-wrap items-center justify-between gap-2 py-2.5", topic.parentId && "pl-5")}>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{topic.title}</span>
              <span className="block text-xs text-muted-foreground">{topic.sourceLabel}</span>
            </span>
            <span className="flex gap-1.5">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("dismiss", [topic.id])} aria-label={`Dismiss ${topic.title}`}>
                Dismiss
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("confirm", [topic.id])} aria-label={`Confirm ${topic.title}`}>
                Confirm
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditTopicDialog({
  courseId,
  topic,
  topics,
  onClose,
}: {
  courseId: string;
  topic: TopicRow;
  topics: TopicRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(topic.title);
  const [parentId, setParentId] = useState(topic.parentId ?? "");
  const [prereqs, setPrereqs] = useState<string[]>(topic.prerequisiteIds);
  const [pending, startTransition] = useTransition();
  const hasChildren = topics.some((t) => t.parentId === topic.id);
  const parentOptions = topics.filter((t) => !t.parentId && t.id !== topic.id);
  const prereqOptions = topics.filter((t) => t.id !== topic.id);

  function save() {
    startTransition(async () => {
      const changes: { title?: string; parentId?: string | null } = {};
      if (title.trim() !== topic.title) changes.title = title;
      if ((parentId || null) !== topic.parentId) changes.parentId = parentId || null;
      if (Object.keys(changes).length) {
        const result = await updateTopicAction({ classId: courseId, topicId: topic.id, ...changes });
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
      }
      for (const id of prereqs.filter((p) => !topic.prerequisiteIds.includes(p))) {
        const result = await addPrerequisiteAction({ classId: courseId, topicId: topic.id, prerequisiteId: id });
        if ("error" in result) {
          toast.error(result.error);
          router.refresh();
          return;
        }
      }
      for (const id of topic.prerequisiteIds.filter((p) => !prereqs.includes(p))) {
        await removePrerequisiteAction({ classId: courseId, topicId: topic.id, prerequisiteId: id });
      }
      router.refresh();
      onClose();
    });
  }

  function remove() {
    if (!window.confirm(`Delete "${topic.title}"? Your practice history stays; it just won't be grouped under this topic.`)) return;
    startTransition(async () => {
      const result = await deleteTopicAction({ classId: courseId, topicId: topic.id });
      if ("error" in result) toast.error(result.error);
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit topic</DialogTitle>
        <DialogDescription>Rename it, nest it under another topic, or say what it builds on.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="topic-title">Name</Label>
          <Input id="topic-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topic-parent">Inside</Label>
          <select id="topic-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectClass} disabled={hasChildren}>
            <option value="">Top level</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {hasChildren && <p className="text-xs text-muted-foreground">It has subtopics, so it stays at the top level.</p>}
        </div>
        {prereqOptions.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Builds on (prerequisites)</legend>
            <p className="text-xs text-muted-foreground">When this topic is a struggle, Rushd checks these first.</p>
            <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {prereqOptions.map((option) => {
                const checked = prereqs.includes(option.id);
                return (
                  <label key={option.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted/60">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--signal)]"
                      checked={checked}
                      onChange={() => setPrereqs((current) => (checked ? current.filter((p) => p !== option.id) : [...current, option.id]))}
                    />
                    {option.title}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="destructive" onClick={remove} disabled={pending}>
          Delete topic
        </Button>
        <Button onClick={save} disabled={pending || !title.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

function TopicItem({
  courseId,
  topic,
  isFirst,
  isLast,
  onEdit,
  tutorEnabled,
}: {
  courseId: string;
  topic: TopicRow;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  tutorEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveTopicAction({ classId: courseId, topicId: topic.id, direction });
      if ("error" in result) toast.error(result.error);
      router.refresh();
    });
  }
  return (
    <li className={cn("py-3.5", topic.parentId && "ml-4 border-l border-border pl-4 sm:ml-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("text-sm font-medium", !topic.parentId && "text-[15px]")}>{topic.title}</h3>
            <MasteryChip status={topic.status} />
            {topic.due && <span className="text-xs font-medium text-signal-ink">Review due</span>}
          </div>
          {estimateLine(topic) && <p className="mt-1 text-xs text-muted-foreground">{estimateLine(topic)}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{topic.explanation}</p>
          {topic.prerequisiteTitles.length > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              Builds on {topic.prerequisiteTitles.join(", ")}
            </p>
          )}
          {topic.remediation && (
            <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">{topic.remediation.title ? `Start with ${topic.remediation.title}. ` : "Where to start: "}</span>
              <span className="text-muted-foreground">{topic.remediation.reason}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={pending || isFirst} onClick={() => move("up")} aria-label={`Move ${topic.title} up`}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={pending || isLast} onClick={() => move("down")} aria-label={`Move ${topic.title} down`}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${topic.title}`}>
            <Pencil />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StartPracticeButton classId={courseId} topicId={topic.id} label="Practice" size="sm" variant="ghost" className="-ml-2.5" />
        {tutorEnabled && (
          <Link
            href={`/tutor?topic=${topic.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-9 sm:min-h-0")}
            aria-label={`Ask the tutor about ${topic.title}`}
          >
            <MessageCircleQuestion aria-hidden="true" />
            Ask the tutor
          </Link>
        )}
      </div>
    </li>
  );
}

export function TopicsEditor({
  courseId,
  topics,
  proposed,
  tutorEnabled = false,
}: {
  courseId: string;
  topics: TopicRow[];
  proposed: TopicRow[];
  tutorEnabled?: boolean;
}) {
  const [editing, setEditing] = useState<TopicRow | null>(null);
  const roots = topics.filter((t) => !t.parentId);
  function siblingsOf(topic: TopicRow) {
    return topics.filter((t) => t.parentId === topic.parentId);
  }
  return (
    <div className="space-y-8">
      {proposed.length > 0 && <ProposedTopics courseId={courseId} proposed={proposed} />}

      <section aria-labelledby="topic-map-heading" className="space-y-4">
        <div>
          <h2 id="topic-map-heading" className="text-base font-semibold">
            Topic map
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The topics in your course, in the order you learn them. Each status comes from your own practice answers, and says
            how sure Rushd can be. One right answer is never enough to call a topic secure.
          </p>
        </div>
        <AddTopicForm courseId={courseId} parents={roots} />
        {topics.length === 0 ? (
          <PathEmpty title="No topics yet">
            Add the units or concepts from your syllabus or class notes. Rushd doesn&apos;t guess your course&apos;s topics.
          </PathEmpty>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {topics.map((topic) => {
              const siblings = siblingsOf(topic);
              return (
                <TopicItem
                  key={topic.id}
                  courseId={courseId}
                  topic={topic}
                  isFirst={siblings[0]?.id === topic.id}
                  isLast={siblings[siblings.length - 1]?.id === topic.id}
                  onEdit={() => setEditing(topic)}
                  tutorEnabled={tutorEnabled}
                />
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && <EditTopicDialog key={editing.id} courseId={courseId} topic={editing} topics={topics} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
