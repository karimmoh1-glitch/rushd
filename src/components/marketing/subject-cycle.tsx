"use client";

import { useEffect, useState } from "react";

const SUBJECTS = ["calculus.", "chemistry.", "biology.", "history.", "physics.", "Spanish.", "any subject."];

/** The subject in the hero headline, cycling. Static for reduced motion and
 * for assistive tech (which reads "any subject"). */
export function SubjectCycle() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % SUBJECTS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <span className="sr-only">any subject.</span>
      <span aria-hidden="true" className="relative -mb-[0.22em] inline-block overflow-hidden pb-[0.22em] pr-[0.08em] align-bottom">
        <span key={i} className="subject-in inline-block italic text-foreground">
          {SUBJECTS[i]}
        </span>
      </span>
    </>
  );
}
