import Link from "next/link";
import { Download } from "lucide-react";
import { DESKTOP_ASSETS } from "@/lib/desktop-release";

export function DownloadButtons() {
  const mac = DESKTOP_ASSETS.find((a) => a.os === "macOS");
  const win = DESKTOP_ASSETS.find((a) => a.os === "Windows");
  if (!mac && !win) {
    return (
      <p className="text-sm text-muted-foreground">
        Desktop builds aren&apos;t published yet. <Link href="/download" className="underline underline-offset-4">Details</Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {[mac, win].flatMap((a) =>
        a
          ? [
              <a key={a.url} href={a.url} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
                <Download className="h-4 w-4" aria-hidden="true" />
                {a.os}
              </a>,
            ]
          : [],
      )}
      <Link href="/download" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Install notes</Link>
    </div>
  );
}
