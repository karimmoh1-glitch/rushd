"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

export function ShareStreak({ url, streak }: { url: string; streak: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (typeof navigator.share === "function") await navigator.share({ title: `${streak}-day study streak`, text: "I'm studying with Rushd.", url });
          else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }
        } catch {
          // Cancelled or blocked.
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <Share2 className="h-3 w-3" aria-hidden="true" />
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
