"use client";

import { useState, useTransition } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setClassArchived } from "@/server/actions/classes";
import { dismissArchiveSuggestion } from "@/server/actions/plan-overrides";

/** After a course's term ends, Rushd asks once whether to archive it. It
 * never archives on its own, and archiving keeps every assignment, session
 * and mastery record. */
export function ArchiveSuggestion({ classId, name, endedLabel }: { classId: string; name: string; endedLabel: string }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  function archive() {
    startTransition(async () => {
      const result = await setClassArchived(classId, true);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setHidden(true);
      toast.success(`${name} archived. Its history stays under Courses.`);
    });
  }

  function notNow() {
    startTransition(async () => {
      const result = await dismissArchiveSuggestion(classId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setHidden(true);
    });
  }

  return (
    <section
      aria-label={`Archive ${name}?`}
      className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:flex-row sm:items-center sm:px-5"
    >
      <Archive className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">
          {" "}ended {endedLabel}. Archive it? Rushd stops planning it and keeps all its history.
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={archive} disabled={pending}>
          Archive
        </Button>
        <Button variant="ghost" size="sm" onClick={notNow} disabled={pending}>
          Not now
        </Button>
      </div>
    </section>
  );
}
