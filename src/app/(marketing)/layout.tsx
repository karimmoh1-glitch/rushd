import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight">Rushd</span>
              <span className="text-sm text-muted-foreground" lang="ar" dir="rtl">
                رُشد
              </span>
            </div>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Arabic for guidance and sound judgment: being on the right path. A free planner for students with a lot
              on their plate.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-xs font-medium text-muted-foreground">Product</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/#demo" className="hover:text-brand-ink">Planner</Link></li>
              <li><Link href="/#canvas" className="hover:text-brand-ink">Canvas integration</Link></li>
              <li><Link href="/#how" className="hover:text-brand-ink">How it works</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="text-xs font-medium text-muted-foreground">Account</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/signup" className="hover:text-brand-ink">Get started</Link></li>
              <li><Link href="/login" className="hover:text-brand-ink">Log in</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="text-xs font-medium text-muted-foreground">Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/privacy" className="hover:text-brand-ink">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-brand-ink">Terms</Link></li>
              <li><Link href="/contact" className="hover:text-brand-ink">Contact</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Rushd · therushd.com
        </div>
      </footer>
    </div>
  );
}
