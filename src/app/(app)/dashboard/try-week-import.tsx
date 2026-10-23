"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { TryItem } from "@/lib/try/parse-week";
import { clearTry, readFreshTry } from "@/lib/try/storage";
import { importTriedWeek } from "@/server/actions/try-week";

// Offers to add the week the student ranked on the homepage before signing up.
// The list lives only in this browser and is ignored after two weeks.

/** The saved items, or an empty list if nothing (valid) was saved. */
function parseStoredItems(stored: string | null): TryItem[] {
  if (!stored) return [];
  try {
    const data = JSON.parse(stored) as { items?: TryItem[] } | null;
    if (data?.items && Array.isArray(data.items)) return data.items;
    return [];
  } catch {
    return [];
  }
}

export function TryWeekImport() {
  const router = useRouter();
  // localStorage only exists in the browser, so read it after mounting.
  const [stored, setStored] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStored(readFreshTry());
  }, []);

  const items = parseStoredItems(stored);
  if (hidden || items.length === 0) return null;

  function handleAdd() {
    startTransition(async () => {
      const weekItems = items.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes }));
      const result = await importTriedWeek(weekItems);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      clearTry();
      setHidden(true);
      router.refresh();
    });
  }

  function handleDismiss() {
    clearTry();
    setHidden(true);
  }

  return (
    <section className="rounded-xl border border-signal/50 bg-signal-soft/40 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">From the homepage</p>
      <p className="mt-1 font-medium">
        Add the {items.length === 1 ? "item" : `${items.length} items`} you ranked?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.slice(0, 3).map((item) => item.title).join(", ")}
        {items.length > 3 ? `, and ${items.length - 3} more` : ""}. You can edit or delete any of them after.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button disabled={pending} onClick={handleAdd}>
          {pending ? "Adding…" : "Add them"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={handleDismiss}>
          No thanks
        </Button>
      </div>
    </section>
  );
}
