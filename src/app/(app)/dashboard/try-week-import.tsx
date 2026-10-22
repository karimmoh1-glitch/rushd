"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TRY_STORAGE_KEY, type TryItem } from "@/lib/try/parse-week";
import { importTriedWeek } from "@/server/actions/try-week";

// Offers to add the week the student ranked on the homepage before signing
// up. The list lives only in this browser; it's removed once added or
// dismissed, and ignored after two weeks.

const MAX_AGE = 14 * 86_400_000;

// Returns the stored list only while it's fresh.
function read(): string | null {
  try {
    const raw = localStorage.getItem(TRY_STORAGE_KEY);
    if (!raw) return null;
    const savedAt = (JSON.parse(raw) as { savedAt?: number }).savedAt ?? 0;
    return Date.now() - savedAt < MAX_AGE ? raw : null;
  } catch {
    return null;
  }
}

function clear() {
  try {
    localStorage.removeItem(TRY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const noop = () => () => {};

export function TryWeekImport() {
  const router = useRouter();
  const stored = useSyncExternalStore(noop, read, () => null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  let items: TryItem[] = [];
  try {
    const data = stored ? (JSON.parse(stored) as { items?: TryItem[] }) : null;
    if (data?.items && Array.isArray(data.items)) items = data.items;
  } catch {
    items = [];
  }
  if (hidden || items.length === 0) return null;

  return (
    <section className="rounded-xl border border-signal/50 bg-signal-soft/40 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">From the homepage</p>
      <p className="mt-1 font-medium">
        Add the {items.length === 1 ? "item" : `${items.length} items`} you ranked?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.slice(0, 3).map((i) => i.title).join(", ")}
        {items.length > 3 ? `, and ${items.length - 3} more` : ""}. You can edit or delete any of them after.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await importTriedWeek(
                items.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes })),
              );
              if ("error" in r) {
                setError(r.error);
                return;
              }
              clear();
              setHidden(true);
              router.refresh();
            })
          }
        >
          {pending ? "Adding…" : "Add them"}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            clear();
            setHidden(true);
          }}
        >
          No thanks
        </Button>
      </div>
    </section>
  );
}
