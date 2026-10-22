"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

interface Props {
  url: string;
  joined: number;
  qualified: number;
  bonus: number;
  perFriend: number;
  maxFriends: number;
}

export function InviteCard({ url, joined, qualified, bonus, perFriend, maxFriends }: Props) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the link is visible to copy by hand.
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div>
        <p className="font-medium">Study with friends, get more tutor time</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When a friend joins with your link and studies once, you both get {perFriend} more tutor messages every month
          (up to {maxFriends} friends).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">{url}</code>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare && (
          <Button
            type="button"
            onClick={() => navigator.share({ title: "Rushd", text: "I use Rushd to figure out what to study next. Try it:", url }).catch(() => {})}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {joined === 0
          ? "No friends have joined yet."
          : `${joined} joined · ${qualified} studied · +${bonus} tutor messages a month for you`}
      </p>
    </div>
  );
}
