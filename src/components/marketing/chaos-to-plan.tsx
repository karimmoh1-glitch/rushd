"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

export interface ChaosItem {
  key: string;
  title: string;
  className: string;
  classColor: string;
  dueLabel: string;
}

// Deterministic "scattered" layout (percent offsets + rotation) so server and
// client render identically.
const SCATTER = [
  { x: -26, y: -150, r: -9 },
  { x: 24, y: -96, r: 7 },
  { x: -32, y: -24, r: 4 },
  { x: 20, y: 36, r: -6 },
  { x: -14, y: 112, r: 10 },
  { x: 30, y: 150, r: -4 },
  { x: -30, y: 190, r: -8 },
  { x: 10, y: -200, r: 5 },
];

const ROW = 52;

function Chip({
  item,
  index,
  total,
  progress,
  settled,
}: {
  item: ChaosItem;
  index: number;
  total: number;
  progress: MotionValue<number>;
  settled: boolean;
}) {
  const s = SCATTER[index % SCATTER.length];
  const start = 0.12 + index * 0.025;
  const end = 0.55 + index * 0.025;
  const orderedY = index * ROW - ((total - 1) * ROW) / 2;
  const x = useTransform(progress, [start, end], [`${s.x}%`, "0%"]);
  const y = useTransform(progress, [start, end], [s.y, orderedY]);
  const rotate = useTransform(progress, [start, end], [s.r, 0]);

  return (
    <motion.li
      style={{ x, y, rotate }}
      className="absolute inset-x-0 top-1/2 mx-auto flex h-11 w-full max-w-sm -translate-y-1/2 items-center gap-3 rounded-xl border border-border bg-card px-3 shadow-sm"
    >
      {/* Opacity is driven by a JS flag, not a scroll-linked motion value:
          Motion offloads scroll-linked opacity to native ViewTimeline
          animations, which drop their effect once scrolled past the range. */}
      <motion.span
        initial={false}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-brand-ink"
      >
        {index + 1}
      </motion.span>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.classColor }} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{item.dueLabel}</span>
    </motion.li>
  );
}

/**
 * Scroll-driven: the week's deadlines start scattered and settle into the
 * order Rushd's engine actually ranks them. Pinned with CSS sticky; progress
 * comes from Motion's useScroll (no scroll listeners). Reduced motion shows
 * the ranked list directly.
 */
export function ChaosToPlan({ items }: { items: ChaosItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [settled, setSettled] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setSettled(v > 0.72));

  if (reduce) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
        <Copy />
        <ol className="mx-auto mt-10 max-w-sm space-y-2">
          {items.map((item, i) => (
            <li key={item.key} className="flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-3">
              <span className="w-5 text-right font-mono text-xs text-brand-ink">{i + 1}</span>
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: item.classColor }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.dueLabel}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative h-[200vh] md:h-[230vh]">
      <div className="sticky top-0 flex min-h-[100dvh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.1fr] lg:px-8">
          <div>
            <Copy />
            <motion.p
              initial={false}
              animate={{ opacity: settled ? 1 : 0, y: settled ? 0 : 6 }}
              transition={{ duration: 0.4 }}
              className="mt-6 text-base font-medium"
            >
              Ranked by deadline, weight, and the time you actually have.
            </motion.p>
          </div>
          <ol className="relative h-[460px]" aria-label="This week's deadlines, ranked">
            {items.map((item, i) => (
              <Chip
                key={item.key}
                item={item}
                index={i}
                total={items.length}
                progress={scrollYProgress}
                settled={settled}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Copy() {
  return (
    <>
      <h2 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl">
        Canvas lists everything. It ranks nothing.
      </h2>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        Every class posts on its own schedule. Rushd pulls it into one order, so the first thing you open is the thing
        that matters.
      </p>
    </>
  );
}
