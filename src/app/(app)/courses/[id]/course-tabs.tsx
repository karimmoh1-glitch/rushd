"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/topics", label: "Topics" },
  { href: "/practice", label: "Practice" },
  { href: "/mistakes", label: "Mistakes" },
] as const;

/** The course workspace's sections. Plain links, so each one is its own page. */
export function CourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;
  function isActive(href: string): boolean {
    if (href === "") return pathname === base || pathname.startsWith(`${base}/material`);
    return pathname === `${base}${href}` || pathname.startsWith(`${base}${href}/`);
  }
  return (
    <nav aria-label="Course sections" className="-mx-1 mt-5 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.label}>
              <Link
                href={`${base}${tab.href}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center px-3 text-sm transition-colors duration-150",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-x-3 bottom-0 h-0.5 rounded-full", active ? "course-rule" : "bg-transparent")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
