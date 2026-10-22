"use client";

import { useSearchParams } from "next/navigation";

// Shown on the homepage after following a friend's invite link (/r/<code>).
export function InvitedNote({ bonus }: { bonus: number }) {
  const invited = useSearchParams().get("invited") === "1";
  if (!invited) return null;
  return (
    <div className="border-b border-signal/40 bg-signal-soft/40">
      <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <span className="font-medium">A friend invited you to Rushd.</span>{" "}
        <span className="text-muted-foreground">Sign up and study once, and you both get {bonus} more tutor messages every month.</span>
      </p>
    </div>
  );
}
