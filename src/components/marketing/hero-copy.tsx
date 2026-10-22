import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Server-rendered with CSS entrances: the headline is visible from first
// paint (good for LCP and slow phones) instead of waiting for JS.
export function HeroCopy() {
  return (
    <div>
      <h1 className="anim-rise max-w-xl text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
        Every deadline, turned into a plan.
      </h1>
      <p
        className="anim-rise mt-6 max-w-md text-lg leading-relaxed text-muted-foreground"
        style={{ animationDelay: "100ms" }}
      >
        Rushd reads your Canvas deadlines and free time, then builds a realistic schedule for what to do tonight.
      </p>
      <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "200ms" }}>
        <Link
          href="/signup"
          className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.98]"
        >
          Get started
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <a
          href="#demo"
          className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-muted active:scale-[0.98]"
        >
          Try the planner
        </a>
      </div>
    </div>
  );
}
