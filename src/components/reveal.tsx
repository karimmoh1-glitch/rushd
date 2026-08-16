"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Fades and slides content in once it scrolls into view. Client-only
 * wrapper around otherwise-static marketing sections — keeps the page's
 * content itself server-rendered. Respects prefers-reduced-motion, which
 * also doubles as a safety net: content starts fully visible rather than
 * depending on an animation ever completing. */
function useRevealMotion() {
  const reduceMotion = useReducedMotion();
  return {
    initial: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" } as const,
  };
}

export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const revealMotion = useRevealMotion();
  return (
    <motion.div {...revealMotion} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** Same reveal animation, but rendered as an <li> — a <div> wrapper isn't
 * valid directly inside <ol>/<ul> and browsers will silently hoist it out,
 * breaking list semantics. */
export function RevealListItem({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const revealMotion = useRevealMotion();
  return (
    <motion.li
      {...revealMotion}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.li>
  );
}
