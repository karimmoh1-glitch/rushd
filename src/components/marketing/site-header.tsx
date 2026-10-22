"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#demo", id: "demo", label: "Planner" },
  { href: "#canvas", id: "canvas", label: "Canvas" },
  { href: "#how", id: "how", label: "How it works" },
] as const;

/** Sticky header with an opaque surface from first paint (no JS needed to
 * keep content from showing through); the link for the section in view is
 * marked via IntersectionObserver. */
export function SiteHeader() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    // Track which sections cross the middle band of the viewport; none (e.g.
    // back up in the hero) means no link is active.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        setActive(LINKS.find((l) => visible.has(l.id))?.id ?? null);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const l of LINKS) {
      const el = document.getElementById(l.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-baseline gap-2" aria-label="Rushd home">
          <span className="text-lg font-semibold tracking-tight">Rushd</span>
          <span className="hidden text-sm text-muted-foreground sm:inline" lang="ar" dir="rtl">
            رُشد
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={l.href}
              aria-current={active === l.id ? "true" : undefined}
              className={cn(
                "relative hidden rounded-lg px-3 py-2 text-sm transition-colors md:block",
                active === l.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
              {active === l.id && (
                <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-px bg-foreground" />
              )}
            </a>
          ))}
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <ThemeToggle />
          <Link
            href="/signup"
            className="ml-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
