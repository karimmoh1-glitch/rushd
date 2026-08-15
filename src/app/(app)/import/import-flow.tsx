"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Upload, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  extractFromScreenshots,
  commitImportedAssignments,
  type ImportItem,
} from "@/server/actions/import";
import { ExtractedItemRow, draftFromExtracted, type DraftItem, type ClassOption } from "./extracted-item-row";

const PROCESSING_MESSAGES = [
  "Reading your screenshot…",
  "Finding assignments…",
  "Checking due dates…",
  "Estimating effort…",
];

type Stage =
  | { name: "upload" }
  | { name: "processing" }
  | { name: "review"; items: DraftItem[] }
  | { name: "unavailable" }
  | { name: "error"; message: string };

export function ImportFlow({ classes }: { classes: ClassOption[] }) {
  const [stage, setStage] = useState<Stage>({ name: "upload" });
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [messageIndex, setMessageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (stage.name !== "processing") return;
    const interval = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, PROCESSING_MESSAGES.length - 1));
    }, 1400);
    return () => clearInterval(interval);
  }, [stage.name]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...next].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleExtract() {
    if (files.length === 0 || classes.length === 0) return;
    setMessageIndex(0);
    setStage({ name: "processing" });

    const formData = new FormData();
    files.forEach((f) => formData.append("images", f));

    startTransition(async () => {
      const result = await extractFromScreenshots(formData);

      if (result.status === "error") {
        setStage({ name: "upload" });
        toast.error(result.error);
        return;
      }
      if (result.status === "unavailable") {
        setStage({ name: "unavailable" });
        return;
      }

      const now = new Date();
      const drafts = result.assignments.map((a, i) =>
        draftFromExtracted(a, i, classes[0].id, now),
      );

      if (drafts.length === 0) {
        setStage({ name: "error", message: "No assignments found in that image. Try a clearer screenshot, or add them manually." });
        return;
      }

      setStage({ name: "review", items: drafts });
    });
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    if (stage.name !== "review") return;
    setStage({
      name: "review",
      items: stage.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }

  function handleCommit() {
    if (stage.name !== "review") return;
    const selected = stage.items.filter((i) => i.included);
    if (selected.length === 0) {
      toast.error("Select at least one to add.");
      return;
    }

    const payload: ImportItem[] = selected.map((i) => ({
      kind: i.kind,
      title: i.title,
      classId: i.classId,
      dueAt: new Date(i.dueAt).toISOString(),
      minutes: i.minutes,
    }));

    startTransition(async () => {
      const result = await commitImportedAssignments(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.created} item${result.created === 1 ? "" : "s"}.`);
      setStage({ name: "upload" });
      setFiles([]);
    });
  }

  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-muted-foreground">Add a class first.</p>
        <Link href="/classes" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
          Go to Classes
        </Link>
      </div>
    );
  }

  if (stage.name === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
          {PROCESSING_MESSAGES[messageIndex]}
        </p>
      </div>
    );
  }

  if (stage.name === "unavailable") {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="font-medium">Screenshot import isn&apos;t available right now.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Add what you saw in the screenshot directly instead — it only takes a minute.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/assignments">
            <Button variant="outline">Add assignment manually</Button>
          </Link>
          <Button onClick={() => setStage({ name: "upload" })}>Try again</Button>
        </div>
      </div>
    );
  }

  if (stage.name === "error") {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="font-medium">{stage.message}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/assignments">
            <Button variant="outline">Add manually</Button>
          </Link>
          <Button onClick={() => setStage({ name: "upload" })}>Try another screenshot</Button>
        </div>
      </div>
    );
  }

  if (stage.name === "review") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            We found {stage.items.length} item{stage.items.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and correct anything before adding it to your plan.
          </p>
        </div>
        <div className="space-y-3">
          {stage.items.map((item) => (
            <ExtractedItemRow
              key={item.id}
              item={item}
              classes={classes}
              onChange={(patch) => updateItem(item.id, patch)}
            />
          ))}
        </div>
        <div className="flex gap-3 border-t border-border pt-4">
          <Button onClick={handleCommit} disabled={pending}>
            {pending ? "Adding…" : `Add ${stage.items.filter((i) => i.included).length} item(s)`}
          </Button>
          <Button variant="ghost" onClick={() => { setStage({ name: "upload" }); setFiles([]); }}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  // stage.name === "upload"
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Bring your workload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your Canvas calendar or assignment list and Rushd will organize it for you.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        aria-label="Upload screenshots"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragOver ? "border-primary bg-accent" : "border-border hover:bg-muted"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 font-medium">Drag screenshots here, or tap to choose</p>
        <p className="mt-1 text-sm text-muted-foreground">PNG or JPEG, up to 5 images</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, i) => (
            <Card key={i} className="relative overflow-hidden py-0">
              <CardContent className="flex items-center gap-2 p-3">
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button onClick={handleExtract} disabled={files.length === 0 || pending}>
        Extract assignments
      </Button>
    </div>
  );
}
