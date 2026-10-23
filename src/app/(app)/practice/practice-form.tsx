"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitPracticeCheck } from "@/server/actions/practice";
import { compressImage, ImagePrepError } from "@/lib/upload/compress";
import { PathLoader } from "@/components/brand/path-loader";

const MAX_PHOTOS = 2;
const STAGES = ["Preparing your photo…", "Reading your work…", "Checking each answer…", "Finding what to study next…"];

export function PracticeForm({ classes }: { classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [mode, setMode] = useState<"photo" | "type">("photo");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function addFiles(list: FileList | null) {
    setError(null);
    setUnreadable(null);
    if (!list?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos per check.`);
      return;
    }
    setStage(STAGES[0]);
    try {
      const chosen = Array.from(list).slice(0, room);
      const prepared = await Promise.all(chosen.map((file) => compressImage(file)));
      const newPhotos = prepared.map((file) => ({ file, url: URL.createObjectURL(file) }));
      setPhotos((current) => [...current, ...newPhotos]);
    } catch (err) {
      setError(err instanceof ImagePrepError ? err.message : "Couldn't use that image.");
    } finally {
      setStage(null);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.target.value = ""; // so picking the same file again still fires onChange
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUnreadable(null);
    const form = new FormData(event.currentTarget);
    const data = new FormData();
    if (mode === "photo") {
      for (const photo of photos) {
        data.append("images", photo.file);
      }
    } else {
      data.set("text", String(form.get("text") ?? ""));
    }
    for (const key of ["context", "classId"]) {
      const value = form.get(key);
      if (value) data.set(key, String(value));
    }
    if (mode === "photo" && photos.length === 0) {
      setError("Add a photo of your work first.");
      return;
    }

    // Move the progress message along every 6 seconds, stopping at the last one.
    let stageIndex = 1;
    setStage(STAGES[1]);
    const timer = setInterval(() => {
      stageIndex += 1;
      setStage(STAGES[Math.min(STAGES.length - 1, stageIndex)]);
    }, 6000);

    startTransition(async () => {
      try {
        const result = await submitPracticeCheck(data);
        if (result.status === "ok") {
          router.push(`/practice/${result.id}`);
          return;
        }
        if (result.status === "unreadable") {
          setUnreadable(result.message);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Upload failed. Check your connection and try again.");
      } finally {
        clearInterval(timer);
        setStage(null);
      }
    });
  }

  const busy = pending || stage !== null;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div role="tablist" aria-label="How to submit" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(["photo", "type"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={mode === option ? "rounded-md bg-muted px-3 py-1.5 font-medium" : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"}
          >
            {option === "photo" ? "Photo" : "Type it"}
          </button>
        ))}
      </div>

      {mode === "photo" ? (
        <div className="space-y-3">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileInput} />
          <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileInput} />
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {photos.map((photo, index) => (
                <li key={photo.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={photo.url} alt={`Photo ${index + 1} of your work`} className="h-32 w-24 rounded-md border border-border object-cover" />
                  <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                Take a photo
              </Button>
              <Button type="button" variant="outline" onClick={() => libraryRef.current?.click()} disabled={busy}>
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                Choose from files
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Questions and your work in frame, flat and well lit. Up to {MAX_PHOTOS} photos. Photos are read and then discarded;
            only the results are saved.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="practice-text">Questions and your answers</Label>
          <Textarea id="practice-text" name="text" rows={7} maxLength={6000} placeholder={"1) Differentiate sin(3x²)\nMy answer: cos(3x²)\n\n2) …"} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="practice-context">What is this? (optional)</Label>
          <Input id="practice-context" name="context" maxLength={200} placeholder="e.g. Unit 4 review, chain rule" />
        </div>
        {classes.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="practice-class">Course (optional)</Label>
            <select id="practice-class" name="classId" defaultValue="" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="">None</option>
              {classes.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {unreadable && (
        <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <p className="font-medium">Rushd couldn&apos;t read this reliably.</p>
          <p className="mt-0.5 text-muted-foreground">{unreadable}</p>
          <p className="mt-1 text-muted-foreground">This didn&apos;t use one of your checks. Retake the photo, or switch to “Type it”.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>{pending ? "Checking…" : "Check my work"}</Button>
        {stage && (
          <span className="flex items-center gap-2.5 text-sm text-muted-foreground" aria-live="polite">
            <PathLoader label={stage} />
            {stage}
          </span>
        )}
      </div>
    </form>
  );
}
