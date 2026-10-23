"use client";

import { useEffect, useState } from "react";

const SUBJECTS = ["calculus.", "chemistry.", "biology.", "history.", "physics.", "Spanish.", "any subject."];

/** The subject in the hero headline, cycling. Static for reduced motion and
 * for assistive tech (which reads "any subject"). */
export function SubjectCycle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % SUBJECTS.length), 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <span className="sr-only">any subject.</span>
      <span aria-hidden="true" className="relative -mb-[0.22em] inline-block overflow-hidden pb-[0.22em] pr-[0.08em] align-bottom">
        <span key={index} className="subject-in inline-block italic text-foreground">
          {SUBJECTS[index]}
        </span>
      </span>
    </>
  );
}
