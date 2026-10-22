import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { RushdLogo } from "@/components/brand/rushd-mark";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/schools", label: "Schools" },
  { href: "/founder", label: "Founder" },
] as const;

/** Server-rendered and opaque from first paint; the phone menu is a native
 * <details> so it works without JavaScript. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Rushd home">
          <RushdLogo />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:block">
            Log in
          </Link>
          <ThemeToggle />
          <Link href="/signup" className="hidden h-9 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            Start free
          </Link>
          <details className="relative md:hidden">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg">
              <nav aria-label="Main (mobile)" className="flex flex-col">
                {LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">{l.label}</Link>
                ))}
                <Link href="/login" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Log in</Link>
                <Link href="/signup" className="mt-1 rounded-full bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">Start learning free</Link>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
