import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/schools", label: "Schools" },
  { href: "/download", label: "Download" },
  { href: "/founder", label: "Founder" },
] as const;

/** Server-rendered, opaque from first paint; the phone menu is a native
 * <details> so it works without JavaScript. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-baseline gap-2" aria-label="Rushd home">
          <span className="text-lg font-semibold tracking-tight">Rushd</span>
          <span className="hidden text-sm text-muted-foreground sm:inline" lang="ar" dir="rtl">رُشد</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/login" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block">
            Log in
          </Link>
          <ThemeToggle />
          <Link href="/signup" className="ml-1 hidden h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex">
            Start learning free
          </Link>
          <details className="group relative lg:hidden">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-11 w-60 rounded-xl border border-border bg-popover p-2 shadow-lg">
              <nav aria-label="Main (mobile)" className="flex flex-col">
                {LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">{l.label}</Link>
                ))}
                <Link href="/login" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Log in</Link>
                <Link href="/signup" className="mt-1 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">Start learning free</Link>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
