"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarRange,
  BookOpen,
  ListChecks,
  Settings,
  LogOut,
  ShieldCheck,
  MessageSquareText,
  PenLine,
  Target,
  Menu,
} from "lucide-react";
import { logout } from "@/server/actions/auth";
import { clearTry } from "@/lib/try/storage";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActiveSessionProvider } from "@/components/active-session-context";
import { ActiveSessionBar } from "@/components/active-session-bar";
import type { ActiveSessionData } from "@/server/actions/study-sessions";
import { cn } from "@/lib/utils";
import { RushdWordmark } from "@/components/brand/rushd-mark";

// The learning loop, in order: what to do today and when, the courses and
// work it comes from, then learn (Tutor), check (Practice), and see progress
// (Mastery).
const NAV_ITEMS = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/plan", label: "Study plan", icon: CalendarRange },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/assignments", label: "Assignments", icon: ListChecks },
  { href: "/tutor", label: "Tutor", icon: MessageSquareText, ai: true },
  { href: "/practice", label: "Practice", icon: PenLine, ai: true },
  // Mastery works without AI (practice with your own questions feeds it).
  { href: "/mastery", label: "Mastery", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Paths that belong to a nav section without sharing its prefix.
const SECTION_ALIASES: Record<string, string> = {
  "/integrations": "/settings",
  "/import": "/assignments",
  "/exams": "/assignments",
  "/profile": "/mastery",
  "/how-rushd-thinks": "/plan",
};

function isActive(pathname: string, href: string): boolean {
  if (pathname.startsWith(href)) return true;
  return Object.entries(SECTION_ALIASES).some(([prefix, section]) => section === href && pathname.startsWith(prefix));
}

// Phones get the four daily destinations plus a "More" page with the rest.
// Without AI, Tutor and Practice give their places to Assignments and Courses.
const MORE = { href: "/more", label: "More", icon: Menu };
function mobileNavItems(ai: boolean) {
  const [today, plan, courses, assignments, tutor, practice] = NAV_ITEMS;
  if (ai) return [today, plan, tutor, practice, MORE];
  return [today, plan, assignments, courses, MORE];
}

// "More" lights up for its own page and for the sections that live inside it on phones.
const MORE_SECTIONS = ["/courses", "/assignments", "/mastery", "/settings", "/exams"];
function isMobileActive(pathname: string, href: string): boolean {
  if (href !== "/more") return isActive(pathname, href);
  return pathname.startsWith("/more") || MORE_SECTIONS.some((p) => pathname.startsWith(p));
}

export function AppShell({
  displayName,
  isAdmin,
  ai,
  activeSession,
  children,
}: {
  displayName: string;
  isAdmin: boolean;
  /** Whether AI features exist on this server; their links hide when not. */
  ai: boolean;
  activeSession: ActiveSessionData | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <ActiveSessionProvider initialSession={activeSession}>
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <Link href="/dashboard" className="flex h-16 items-center px-6" aria-label="Rushd, Today">
          <RushdWordmark />
        </Link>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
          {NAV_ITEMS.filter((item) => ai || !("ai" in item)).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {active && <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-signal" />}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Admin
            </Link>
          )}
        </nav>
        <div className="border-t border-border p-3">
          <div className="px-3 py-1">
            <FeedbackDialog />
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={logout} onSubmit={clearTry}>
                <button
                  type="submit"
                  aria-label="Log out"
                  title="Log out"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
        <Link href="/dashboard" aria-label="Rushd, Today">
          <RushdWordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
          <ThemeToggle />
          <form action={logout} onSubmit={clearTry}>
            <button
              type="submit"
              aria-label="Log out"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      <main id="main-content" className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:ml-56 md:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <ActiveSessionBar />
          {/* Keyed by page so each new page settles in (skipped with reduced motion). */}
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-sidebar-border bg-sidebar/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Main navigation"
      >
        {mobileNavItems(ai).map((item) => {
          const active = isMobileActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-(--dur-ui)",
                  active && "bg-sidebar-accent",
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "text-signal")} aria-hidden="true" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
    </ActiveSessionProvider>
  );
}
