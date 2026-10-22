"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDraftReview } from "@/server/actions/course";

const MIN = 200;
const MAX = 30_000;

export function DraftReviewForm({ assignmentId }: { assignmentId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [length, setLength] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createDraftReview({
        assignmentId,
        draft: String(data.get("draft") ?? ""),
        label: String(data.get("label") ?? "") || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Feedback ready.");
      formRef.current?.reset();
      setLength(0);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="draft">Your draft</Label>
        <Textarea
          id="draft"
          name="draft"
          required
          minLength={MIN}
          maxLength={MAX}
          rows={10}
          onChange={(e) => setLength(e.currentTarget.value.length)}
          placeholder="Paste the text of your draft here."
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {length.toLocaleString()} / {MAX.toLocaleString()} characters{length > 0 && length < MIN ? ` · at least ${MIN} needed` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label (optional)</Label>
          <Input id="label" name="label" maxLength={60} placeholder="e.g. Second draft" className="w-56" />
        </div>
        <Button type="submit" disabled={pending || length < MIN}>
          {pending ? "Reviewing… (up to a minute)" : "Get feedback"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
