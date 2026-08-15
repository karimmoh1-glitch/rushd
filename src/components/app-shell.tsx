"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  ListChecks,
  GraduationCap,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { logout } from "@/server/actions/auth";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/classes", label: "Classes", icon: BookOpen },
  { href: "/assignments", label: "Assignments", icon: ListChecks },
  { href: "/exams", label: "Exams", icon: GraduationCap },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  displayName,
  isAdmin,
  children,
}: {
  displayName: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-border bg-background md:flex">
        <Link
          href="/dashboard"
          className="flex h-16 items-center px-6 font-heading text-lg font-semibold tracking-tight"
        >
          Rushd
        </Link>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
            <form action={logout}>
              <button
                type="submit"
                aria-label="Log out"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
        <Link href="/dashboard" className="font-heading text-lg font-semibold">
          Rushd
        </Link>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Log out"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>

      <main className="pb-20 md:ml-56 md:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background md:hidden"
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
