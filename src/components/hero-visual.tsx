"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Node {
  chaosX: number;
  chaosY: number;
  gridX: number;
  gridY: number;
}

// A fixed field of points that starts scattered ("chaos") and animates into
// an even grid ("a clear plan") — the tagline, made visible. Positions are
// pre-computed (not random-per-render) so server and client agree on the
// first paint and the animation is identical every load.
const COLS = 7;
const ROWS = 5;
const NODES: Node[] = (() => {
  const nodes: Node[] = [];
  // Simple deterministic pseudo-random sequence (no Math.random — must
  // match on server and client render).
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      nodes.push({
        chaosX: rand() * 100,
        chaosY: rand() * 100,
        gridX: (c / (COLS - 1)) * 100,
        gridY: (r / (ROWS - 1)) * 100,
      });
    }
  }
  return nodes;
})();

export function HeroVisual() {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_60%_60%_at_50%_35%,black,transparent)]"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full opacity-60 dark:opacity-70"
      >
        {settled &&
          NODES.map((n, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const neighbor = col < COLS - 1 ? NODES[i + 1] : null;
            const below = row < ROWS - 1 ? NODES[i + COLS] : null;
            return (
              <g key={`lines-${i}`}>
                {neighbor && (
                  <motion.line
                    x1={n.gridX}
                    y1={n.gridY}
                    x2={neighbor.gridX}
                    y2={neighbor.gridY}
                    stroke="var(--color-primary)"
                    strokeWidth="0.12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.35 }}
                    transition={{ duration: 1, delay: 0.1 }}
                  />
                )}
                {below && (
                  <motion.line
                    x1={n.gridX}
                    y1={n.gridY}
                    x2={below.gridX}
                    y2={below.gridY}
                    stroke="var(--color-primary)"
                    strokeWidth="0.12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.35 }}
                    transition={{ duration: 1, delay: 0.1 }}
                  />
                )}
              </g>
            );
          })}
        {NODES.map((n, i) => (
          <motion.circle
            key={i}
            r={0.7}
            fill="var(--color-primary)"
            initial={{ cx: n.chaosX, cy: n.chaosY, opacity: 0 }}
            animate={{
              cx: settled ? n.gridX : n.chaosX,
              cy: settled ? n.gridY : n.chaosY,
              opacity: 1,
            }}
            transition={{
              opacity: { duration: 0.5 },
              cx: { duration: 1.1, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] },
              cy: { duration: 1.1, delay: i * 0.012, ease: [0.22, 1, 0.36, 1] },
            }}
          />
        ))}
      </svg>
    </div>
  );
}
