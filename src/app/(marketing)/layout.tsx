import Link from "next/link";

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
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-heading text-lg font-semibold tracking-tight">
              Rushd
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline" lang="ar" dir="rtl">
              رُشد
            </span>
          </Link>
          <nav className="flex items-center gap-6" aria-label="Main">
            <Link
              href="/#how-it-works"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              How it works
            </Link>
            <Link
              href="/login"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-base font-semibold">Rushd</span>
                <span className="text-sm text-muted-foreground" lang="ar" dir="rtl">
                  رُشد
                </span>
              </div>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Guidance, sound judgment, being on the right path. A free
                academic planning platform for high-school students.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer">
              <Link href="/#how-it-works" className="text-muted-foreground hover:text-foreground">
                How it works
              </Link>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                Terms
              </Link>
              <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                Contact
              </Link>
            </nav>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Rushd. therushd.com
          </p>
        </div>
      </footer>
    </div>
  );
}
