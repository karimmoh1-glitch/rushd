"use client";

import { useTransition } from "react";
import { setInquiryStatus } from "@/server/actions/admin";

export function InquiryStatus({ id, status }: { id: string; status: "new" | "contacted" | "closed" }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Inquiry status"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => startTransition(async () => void (await setInquiryStatus(id, e.target.value as typeof status)))}
      className="h-7 rounded-md border border-input bg-background px-2 text-xs"
    >
      <option value="new">New</option>
      <option value="contacted">Contacted</option>
      <option value="closed">Closed</option>
    </select>
  );
}
