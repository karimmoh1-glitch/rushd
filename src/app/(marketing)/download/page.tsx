import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";
import { DESKTOP_ASSETS, DESKTOP_RELEASE_PAGE, DESKTOP_SIGNED, DESKTOP_VERSION } from "@/lib/desktop-release";

export const metadata: Metadata = {
  title: "Download for Mac and Windows",
  description: "Rushd for macOS and Windows: your Rushd account in its own desktop window. Free download.",
  alternates: { canonical: "/download" },
};

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageViewBeacon path="/download" />
      <h1 className="text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">Rushd for desktop</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A native app window for your Rushd account on Mac and Windows. It opens Rushd directly, keeps you signed in, and sends
        links to other sites to your browser. It&apos;s the same Rushd as the website, so it needs an internet connection.
      </p>

      {DESKTOP_ASSETS.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          The first desktop builds aren&apos;t published yet. Rushd works in any modern browser in the meantime.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {DESKTOP_ASSETS.map((a) => (
            <li key={a.url} className="rounded-xl border border-border bg-card p-5">
              <p className="font-semibold">{a.os}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
              <a href={a.url} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" aria-hidden="true" />
                {a.label}
              </a>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{a.file}</p>
            </li>
          ))}
        </ul>
      )}

      {DESKTOP_ASSETS.length > 0 && !DESKTOP_SIGNED && (
        <section className="mt-10 space-y-3 text-sm">
          <h2 className="text-xl font-semibold tracking-tight">Before you install: these are early test builds</h2>
          <p className="text-muted-foreground">
            Version {DESKTOP_VERSION} isn&apos;t code-signed yet, so your computer will warn you the first time. That&apos;s
            expected for unsigned apps; signed builds are planned.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li><span className="text-foreground">Mac:</span> open the .dmg and drag Rushd into Applications. The first time, open it, then go to System Settings › Privacy &amp; Security and choose “Open Anyway”.</li>
            <li><span className="text-foreground">Windows:</span> run the installer. If SmartScreen appears, choose “More info” › “Run anyway”.</li>
          </ul>
          <p className="text-muted-foreground">
            Builds are produced by a public workflow from the Rushd source; the release page lists the files and their build:{" "}
            <a href={DESKTOP_RELEASE_PAGE} className="underline underline-offset-4">desktop-v{DESKTOP_VERSION}</a>.
          </p>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Prefer the browser? <Link href="/signup" className="underline underline-offset-4">Start learning free</Link> on the web.
      </p>
    </div>
  );
}
