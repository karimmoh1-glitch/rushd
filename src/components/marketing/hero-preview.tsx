import { formatDuration } from "@/lib/format";
import { formatMinuteOfDay } from "@/lib/time/zone";

export interface PreviewBlock {
  key: string;
  title: string;
  className: string;
  classColor: string;
  startMinute: number;
  minutes: number;
}

export interface PreviewData {
  dayLabel: string;
  tonightMinutes: number;
  next: { title: string; className: string; classColor: string; startMinute: number; minutes: number; reasons: string[] };
  blocks: PreviewBlock[];
  week: { key: string; letter: string; minutes: number }[];
}

/**
 * The hero's product preview. Every value comes from running Rushd's real
 * planning engine on a sample student's week (see sample-week.ts); the
 * layout mirrors the dashboard. Server-rendered; the CSS entrance runs from
 * first paint and collapses under reduced motion.
 */
export function HeroPreview({ data }: { data: PreviewData }) {
  const maxWeek = Math.max(1, ...data.week.map((d) => d.minutes));

  return (
    <div className="relative">
      <div className="anim-rise" style={{ animationDelay: "150ms" }}>
      <div
        className="surface relative rounded-2xl p-4 sm:p-5"
        role="img"
        aria-label={`Sample Rushd plan for ${data.dayLabel}: ${data.blocks.length} study blocks tonight, starting with ${data.next.title}.`}
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
          <p className="text-sm font-semibold">{data.dayLabel}</p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            Tonight · {formatDuration(data.tonightMinutes)} planned
          </p>
        </div>

        <div className="anim-rise mt-4 rounded-xl border border-border bg-muted/40 p-4" style={{ animationDelay: "350ms" }}>
          <p className="text-xs font-medium text-muted-foreground">Next up</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: data.next.classColor }} />
            <p className="truncate text-lg font-semibold tracking-tight">{data.next.title}</p>
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {formatMinuteOfDay(data.next.startMinute)} · {formatDuration(data.next.minutes)} · {data.next.className}
          </p>
          <ul className="mt-3 space-y-1">
            {data.next.reasons.map((r) => (
              <li key={r} className="text-sm text-foreground/80">
                {r}
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-4 space-y-1.5">
          {data.blocks.map((b, i) => (
            <li
              key={b.key}
              className="anim-slide-x flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2"
              style={{ animationDelay: `${550 + i * 80}ms` }}
            >
              <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatMinuteOfDay(b.startMinute)}
              </span>
              <span aria-hidden="true" className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: b.classColor }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{b.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {b.className} · {formatDuration(b.minutes)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">This week</p>
          <div className="mt-2 flex h-14 items-end gap-2">
            {data.week.map((d, i) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-10 w-full items-end justify-center">
                  <div
                    className="anim-grow-y w-3 rounded-full bg-brand sm:w-3.5"
                    style={{
                      height: `${Math.max(6, Math.round((d.minutes / maxWeek) * 100))}%`,
                      animationDelay: `${800 + i * 50}ms`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{d.letter}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        A sample student&apos;s week, planned by the same engine you get.
      </p>
    </div>
  );
}
