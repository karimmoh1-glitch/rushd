"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectFeedAction, disconnectFeedAction, syncFeedAction } from "@/server/actions/feed";

function summary(v: { created: number; updated: number; removed: number }) {
  const parts = [`${v.created} new`, `${v.updated} updated`];
  if (v.removed) parts.push(`${v.removed} removed`);
  return parts.join(", ");
}

export function FeedControls({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!connected) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await connectFeedAction(url);
            if ("error" in r) {
              setError(r.error);
              return;
            }
            setUrl("");
            toast.success(`Calendar connected: ${summary(r.value)}.`);
            router.push("/assignments");
          });
        }}
      >
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
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncFeedAction();
            if ("error" in r) toast.error(r.error);
            else toast.success(`Synced: ${summary(r.value)}.`);
            router.refresh();
          })
        }
      >
        {pending ? "Working…" : "Sync now"}
      </Button>
      <div className="space-y-3 border-t border-border pt-6">
        <h2 className="text-base font-semibold">Disconnect</h2>
        <p className="text-sm text-muted-foreground">Deletes the saved feed link right away.</p>
        <div className="flex flex-wrap gap-2">
          {[false, true].map((remove) => (
            <Button
              key={String(remove)}
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(remove ? "Disconnect and delete assignments imported from the feed?" : "Disconnect and keep imported assignments as your own?")) return;
                start(async () => {
                  const r = await disconnectFeedAction(remove);
                  if ("error" in r) toast.error(r.error);
                  else toast.success("Calendar feed disconnected.");
                  router.refresh();
                });
              }}
            >
              {remove ? "Disconnect and remove assignments" : "Disconnect, keep assignments"}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
