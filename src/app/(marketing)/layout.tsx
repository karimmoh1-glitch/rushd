import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";

const FOOTER = [
  { title: "Product", links: [["/#how", "How it works"], ["/pricing", "Pricing"], ["/download", "Desktop apps"], ["/signup", "Start learning free"]] },
  { title: "Company", links: [["/founder", "Founder"], ["/schools", "For schools"], ["/contact", "Contact"]] },
  { title: "Trust", links: [["/privacy", "Privacy"], ["/terms", "Terms"], ["/privacy#ai", "How AI is used"]] },
] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight">Rushd</span>
              <span className="text-sm text-muted-foreground" lang="ar" dir="rtl">رُشد</span>
            </div>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A personal AI learning system for students. The name is Arabic for sound judgment: knowing the right path.
            </p>
          </div>
          {FOOTER.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-medium text-muted-foreground">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="hover:text-primary">{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Rushd</span>
          <span>Made by <Link href="/founder" className="hover:text-foreground">Karim Mohamed</Link></span>
        </div>
      </footer>
    </div>
  );
}
