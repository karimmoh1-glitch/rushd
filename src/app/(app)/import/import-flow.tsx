"use client";

import { compressImage, ImagePrepError } from "@/lib/upload/compress";
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

// The images together must stay under the server's upload limit.
const MAX_TOTAL_BYTES = 3_800_000;
const MAX_FILES = 5;

type Stage =
  | { name: "upload" }
  | { name: "processing" }
  | { name: "review"; items: DraftItem[] }
  | { name: "unavailable" }
  | { name: "error"; message: string };

function totalSize(files: File[]): number {
  let total = 0;
  for (const file of files) {
    total += file.size;
  }
  return total;
}

function NoClassesYet() {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-muted-foreground">Add a class first.</p>
      <Link href="/courses" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
        Go to Classes
      </Link>
    </div>
  );
}

function ProcessingView({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
      <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

function UnavailableView({ onTryAgain }: { onTryAgain: () => void }) {
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
        <Button onClick={onTryAgain}>Try again</Button>
      </div>
    </div>
  );
}

function ErrorView({ message, onTryAgain }: { message: string; onTryAgain: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <p className="font-medium">{message}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Link href="/assignments">
          <Button variant="outline">Add manually</Button>
        </Link>
        <Button onClick={onTryAgain}>Try another screenshot</Button>
      </div>
    </div>
  );
}

export function ImportFlow({ classes }: { classes: ClassOption[] }) {
  const [stage, setStage] = useState<Stage>({ name: "upload" });
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [messageIndex, setMessageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // While processing, step through the messages every 1.4s, stopping at the last one.
  useEffect(() => {
    if (stage.name !== "processing") return;
    const interval = setInterval(() => {
      setMessageIndex((index) => Math.min(index + 1, PROCESSING_MESSAGES.length - 1));
    }, 1400);
    return () => clearInterval(interval);
  }, [stage.name]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list).filter((file) => file.type.startsWith("image/"));
    setFiles((previous) => [...previous, ...images].slice(0, MAX_FILES));
  }

  function removeFile(index: number) {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  }

  function backToUpload() {
    setStage({ name: "upload" });
  }

  function startOver() {
    setStage({ name: "upload" });
    setFiles([]);
  }

  function handleExtract() {
    if (files.length === 0 || classes.length === 0) return;
    setMessageIndex(0);
    setStage({ name: "processing" });

    startTransition(async () => {
      // Phone screenshots are often several MB; shrink them before upload so
      // the request stays under the server's body limit.
      const formData = new FormData();
      try {
        const prepared = await Promise.all(files.map((file) => compressImage(file, 2200)));
        if (totalSize(prepared) > MAX_TOTAL_BYTES) {
          setStage({ name: "upload" });
          toast.error("Those images are too large together. Upload fewer at a time.");
          return;
        }
        for (const file of prepared) {
          formData.append("images", file);
        }
      } catch (error) {
        setStage({ name: "upload" });
        toast.error(error instanceof ImagePrepError ? error.message : "Couldn't prepare those images.");
        return;
      }
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
      const drafts = result.assignments.map((extracted, index) =>
        draftFromExtracted(extracted, index, classes[0].id, now),
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
      items: stage.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function handleCommit() {
    if (stage.name !== "review") return;
    const selected = stage.items.filter((item) => item.included);
    if (selected.length === 0) {
      toast.error("Select at least one to add.");
      return;
    }

    const payload: ImportItem[] = selected.map((item) => ({
      kind: item.kind,
      title: item.title,
      classId: item.classId,
      dueAt: new Date(item.dueAt).toISOString(),
      minutes: item.minutes,
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
    return <NoClassesYet />;
  }

  if (stage.name === "processing") {
    return <ProcessingView message={PROCESSING_MESSAGES[messageIndex]} />;
  }

  if (stage.name === "unavailable") {
    return <UnavailableView onTryAgain={backToUpload} />;
  }

  if (stage.name === "error") {
    return <ErrorView message={stage.message} onTryAgain={backToUpload} />;
  }

  if (stage.name === "review") {
    const includedCount = stage.items.filter((item) => item.included).length;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold">
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
            {pending ? "Adding…" : `Add ${includedCount} item(s)`}
          </Button>
          <Button variant="ghost" onClick={startOver}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  // stage.name === "upload"
  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Bring your workload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your Canvas calendar or assignment list and Rushd will organize it for you.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === "Enter" && openFilePicker()}
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
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <Card key={index} className="relative overflow-hidden py-0">
              <CardContent className="flex items-center gap-2 p-3">
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation(); // don't also open the file picker
                    removeFile(index);
                  }}
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
