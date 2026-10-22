"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { parseWeek } from "@/lib/try/parse-week";
import { importTriedWeek } from "@/server/actions/try-week";

// A new student's first minute: type the week (classes are created from the
// "Class:" prefix or guessed from the words), or connect a school system.
// Uses the same parser and import as "Rank my week" on the homepage.

export function StartWeek() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = text.trim() ? parseWeek(text, new Date()) : [];

  return (
    <section aria-labelledby="start-week" className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-signal-ink">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
        Start here
      </p>
      <h2 id="start-week" className="mt-2 font-display text-2xl font-medium tracking-tight">What&apos;s due this week?</h2>
      <p className="mt-1 text-sm text-muted-foreground">One thing per line. Rushd makes your classes, ranks it all, and plans your time.</p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (preview.length === 0) return;
          start(async () => {
            const r = await importTriedWeek(preview.map(({ kind, title, className, dueAt, minutes }) => ({ kind, title, className, dueAt, minutes })));
            if ("error" in r) setError(r.error);
            else {
              setText("");
              router.refresh();
            }
          });
        }}
      >
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
            {[...new Set(preview.map((p) => p.className))].join(", ")}
            {preview.some((p) => p.assumedDate) ? ". Lines without a day get a week; you can change it after." : "."}
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
          <Link href="/integrations/teams" className={buttonVariants({ variant: "outline" })}>Teams</Link>
        </div>
      </form>
    </section>
  );
}
