"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { parseWeek, type TryItem } from "@/lib/try/parse-week";
import { importTriedWeek } from "@/server/actions/try-week";

// A new student's first step: type the week, or connect a school system.
// Uses the same parser and import as "Rank my week" on the homepage.

export function StartWeek({ teams = false }: { teams?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Classes come from a "Class:" prefix, or are guessed from the words.
  let preview: TryItem[] = [];
  if (text.trim()) {
    preview = parseWeek(text, new Date());
  }
  const classNames = [...new Set(preview.map((item) => item.className))];
  const someDatesGuessed = preview.some((item) => item.assumedDate);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (preview.length === 0) return;
    startTransition(async () => {
      const weekItems = preview.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes }));
      const result = await importTriedWeek(weekItems);
      if ("error" in result) {
        setError(result.error);
      } else {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
        Start here
      </p>
      <h2 className="mt-2 font-display text-2xl font-medium tracking-tight">What&apos;s due this week?</h2>
      <p className="mt-1 text-sm text-muted-foreground">One thing per line. Rushd makes your classes, ranks it all, and plans your time.</p>
      <form className="mt-4" onSubmit={handleSubmit}>
        <label htmlFor="start-week-text" className="sr-only">
          Your assignments and tests this week, one per line
        </label>
        <textarea
          id="start-week-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={2400}
          spellCheck={false}
          placeholder={"Bio: lab report Thursday 2h\nCalc quiz Friday\nEnglish essay draft Monday 3h"}
          className="block w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-[1.7] outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/40"
        />
        {preview.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {preview.length} item{preview.length === 1 ? "" : "s"} in{" "}
            {classNames.join(", ")}
            {someDatesGuessed ? ". Lines without a day get a week; you can change it after." : "."}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending || preview.length === 0} className={buttonVariants()}>
            {pending ? "Adding…" : "Add and rank"}
          </button>
          <span className="px-1 text-sm text-muted-foreground">or bring it in from</span>
          <Link href="/integrations/canvas" className={buttonVariants({ variant: "outline" })}>Canvas</Link>
          {teams && (
            <Link href="/integrations/teams" className={buttonVariants({ variant: "outline" })}>Teams</Link>
          )}
        </div>
      </form>
    </section>
  );
}
