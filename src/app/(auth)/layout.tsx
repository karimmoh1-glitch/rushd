import Link from "next/link";
import { RushdWordmark } from "@/components/brand/rushd-mark";

// The brand side of the auth screens restates what the landing page says
// Rushd does, and what the name means. No numbers, no testimonials.
const PROMISES = ["Built from your real classes", "Checks your actual work", "Picks what to do next"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+2rem)] sm:pt-10 lg:px-10">
        <div className="mx-auto flex max-w-5xl justify-center lg:justify-start">
          <Link href="/" aria-label="Rushd home" className="rounded-md">
            <RushdWordmark className="scale-110 lg:origin-left" />
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12 lg:px-10">
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-20">
          <section aria-label="About Rushd" className="hidden lg:block">
            <p lang="ar" dir="rtl" className="text-left font-arabic text-[5.5rem] font-bold leading-none text-foreground/90" aria-hidden="true">
              رُشد
            </p>
            <p className="mt-6 max-w-sm font-display text-3xl leading-tight tracking-tight">
              Sound judgment: knowing the right path.
            </p>
            <PathLine />
            <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
              {PROMISES.map((line) => (
                <li key={line} className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" />
                  {line}
                </li>
              ))}
            </ul>
          </section>
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
      </main>

      <footer className="flex justify-center gap-5 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/contact" className="hover:text-foreground">Contact</Link>
      </footer>
    </div>
  );
}

/** The mark's rising path, drawn wide: points settling onto a line that ends in the lit node. */
function PathLine() {
  return (
    <svg viewBox="0 0 320 60" className="mt-8 h-14 w-80 text-foreground" aria-hidden="true">
      <path d="M6 52C60 46 96 34 150 30S250 16 300 8" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      {[[6, 52], [56, 46], [104, 35], [150, 30], [204, 24], [252, 16]].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="2.6" fill="currentColor" opacity="0.55" />
      ))}
      <circle cx="300" cy="8" r="5" fill="var(--signal)" />
    </svg>
  );
}
