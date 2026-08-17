"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// Each element gets its own explicit initial/animate pair (rather than
// relying on framer-motion variant propagation from a parent, which was
// unreliable in this tree) — a fixed stagger is faked via per-item delay.
function useItemMotion(delay: number) {
  const reduceMotion = useReducedMotion();
  return {
    initial: { opacity: 0, y: reduceMotion ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.55, ease: EASE, delay: reduceMotion ? 0 : delay },
  };
}

export function HeroContent() {
  const kicker = useItemMotion(0);
  const headline = useItemMotion(0.1);
  const subtitle = useItemMotion(0.22);
  const actions = useItemMotion(0.34);

  return (
    <div>
      <motion.p
        {...kicker}
        className="text-sm font-medium text-primary"
      >
        Five things due this week and no idea where to start?
      </motion.p>
      <motion.h1
        {...headline}
        className="mt-2 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
      >
        Turn academic chaos into a clear plan
      </motion.h1>
      <motion.p
        {...subtitle}
        className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-balance"
      >
        Rushd tracks your classes, assignments, and exams, then tells you
        exactly what to work on right now — and keeps that plan current as
        things change.
      </motion.p>
      <motion.div
        {...actions}
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
      >
        <Link
          href="/signup"
          className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_0_0_rgba(129,140,248,0)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_8px_24px_-6px_var(--color-primary)] active:translate-y-0"
        >
          Get started — it&apos;s free
        </Link>
        <Link
          href="#how-it-works"
          className="rounded-md border border-border px-6 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-muted active:translate-y-0"
        >
          See how it works
        </Link>
      </motion.div>
    </div>
  );
}
