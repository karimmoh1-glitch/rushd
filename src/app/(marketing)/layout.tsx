import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { RushdWordmark } from "@/components/brand/rushd-mark";

const LINKS = [
  ["/how-it-works", "How it works"],
  ["/tools/rank-my-week", "Rank my homework"],
  ["/tools/exam-study-planner", "Plan my finals"],
  ["/pricing", "Pricing"],
  ["/download", "Desktop apps"],
  ["/founder", "Founder"],
  ["/schools", "Schools"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/contact", "Contact"],
] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-full focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <RushdWordmark />
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {LINKS.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-foreground">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 pb-8 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Rushd. رُشد is Arabic for sound judgment: knowing the right path.</span>
          <span>Made by <Link href="/founder" className="hover:text-foreground">Karim Mohamed</Link></span>
        </div>
      </footer>
    </div>
  );
}
