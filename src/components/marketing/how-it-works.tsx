"use client";

import { motion, useReducedMotion } from "framer-motion";

const STEPS = [
  {
    verb: "Connect",
    body: "Link your school's Canvas, upload a calendar screenshot, or type work in. Two minutes.",
  },
  {
    verb: "Tune",
    body: "Tell Rushd when you're free, how long you like to focus, and how much is too much for one day.",
  },
  {
    verb: "Follow",
    body: "Open Rushd, do the next block. When anything changes, the plan rearranges around it.",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function HowItWorks() {
  const reduce = useReducedMotion();
  return (
    <div className="relative">
      <motion.div
        aria-hidden="true"
        className="absolute left-0 right-0 top-[1.15rem] hidden h-px origin-left bg-gradient-to-r from-brand via-border to-border md:block"
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.1, ease: EASE }}
      />
      <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.verb}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: EASE }}
            className="relative"
          >
            <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background font-mono text-sm tabular-nums">
              {i + 1}
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.verb}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
