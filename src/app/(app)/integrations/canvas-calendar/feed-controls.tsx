"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectFeedAction, disconnectFeedAction, syncFeedAction } from "@/server/actions/feed";

const DISCONNECT_OPTIONS = [
  {
    removeImported: false,
    confirmText: "Disconnect and keep imported assignments as your own?",
    label: "Disconnect, keep assignments",
  },
  {
    removeImported: true,
    confirmText: "Disconnect and delete assignments imported from the feed?",
    label: "Disconnect and remove assignments",
  },
];

// e.g. "3 new, 1 updated, 2 removed"
function summary(counts: { created: number; updated: number; removed: number }) {
  const parts = [`${counts.created} new`, `${counts.updated} updated`];
  if (counts.removed) parts.push(`${counts.removed} removed`);
  return parts.join(", ");
}

export function FeedControls({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await connectFeedAction(url);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUrl("");
      toast.success(`Calendar connected: ${summary(result.value)}.`);
      router.push("/assignments");
    });
  }

  function handleSync() {
    startTransition(async () => {
      const result = await syncFeedAction();
      if ("error" in result) toast.error(result.error);
      else toast.success(`Synced: ${summary(result.value)}.`);
      router.refresh();
    });
  }

  function handleDisconnect(removeImported: boolean, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await disconnectFeedAction(removeImported);
      if ("error" in result) toast.error(result.error);
      else toast.success("Calendar feed disconnected.");
      router.refresh();
    });
  }

  if (!connected) {
    return (
      <form className="space-y-3" onSubmit={handleConnect}>
        <Label htmlFor="feed-url">Calendar feed link</Label>
        <Input
          id="feed-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://school.instructure.com/feeds/calendars/user_….ics"
          autoComplete="off"
          spellCheck={false}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending || !url.trim()}>
          {pending ? "Reading your calendar…" : "Connect calendar"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <Button disabled={pending} onClick={handleSync}>
        {pending ? "Working…" : "Sync now"}
      </Button>
      <div className="space-y-3 border-t border-border pt-6">
        <h2 className="text-base font-semibold">Disconnect</h2>
        <p className="text-sm text-muted-foreground">Deletes the saved feed link right away.</p>
        <div className="flex flex-wrap gap-2">
          {DISCONNECT_OPTIONS.map((option) => (
            <Button
              key={option.label}
              variant="outline"
              disabled={pending}
              onClick={() => handleDisconnect(option.removeImported, option.confirmText)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
