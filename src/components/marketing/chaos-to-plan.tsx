import { Reveal } from "@/components/reveal";

export interface ChaosItem {
  key: string;
  title: string;
  className: string;
  classColor: string;
  dueLabel: string;
}

/** The problem statement: every class posts separately; Rushd ranks the week
 * into one order. The list is the engine's actual ranking of the sample week. */
export function ChaosToPlan({ items }: { items: ChaosItem[] }) {
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-[1fr_1.1fr] lg:px-8">
      <Reveal>
        <h2 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl">
          Canvas lists everything. It ranks nothing.
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          Every class posts on its own schedule. Rushd pulls it into one order, ranked by deadline, weight, and the
          time you actually have, so the first thing you open is the thing that matters.
        </p>
      </Reveal>
      <Reveal>
        <ol className="mx-auto w-full max-w-md divide-y divide-border rounded-xl border border-border bg-card" aria-label="A sample week's deadlines, ranked">
          {items.map((item, i) => (
            <li key={item.key} className="flex h-12 items-center gap-3 px-4">
              <span className="w-4 text-right font-mono text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.classColor }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.dueLabel}</span>
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  );
}
