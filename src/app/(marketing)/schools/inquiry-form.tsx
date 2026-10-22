"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitSchoolInquiry, type InquiryState } from "@/server/actions/schools";

export function InquiryForm() {
  const [state, action, pending] = useActionState<InquiryState, FormData>(submitSchoolInquiry, undefined);
  if (state?.ok) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6">
        <p className="font-semibold">Thanks, we&apos;ve got it.</p>
        <p className="mt-1 text-sm text-muted-foreground">Karim will reply to the email you gave, usually within a few days.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" required autoComplete="name" /></div>
        <div className="space-y-1.5"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-1.5"><Label htmlFor="role">Role</Label><Input id="role" name="role" required placeholder="Teacher, counselor, administrator…" /></div>
        <div className="space-y-1.5"><Label htmlFor="organization">School or organization</Label><Input id="organization" name="organization" required autoComplete="organization" /></div>
        <div className="space-y-1.5"><Label htmlFor="studentCount">Students involved (optional)</Label><Input id="studentCount" name="studentCount" placeholder="e.g. one class of 28" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="interest">Interested in</Label>
          <select id="interest" name="interest" defaultValue="pilot" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
            <option value="pilot">A pilot with students</option>
            <option value="information">More information</option>
            <option value="partnership">A partnership</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="message">What would you like Rushd to help with?</Label><Textarea id="message" name="message" required rows={5} maxLength={3000} /></div>
      <div aria-hidden="true" className="absolute -left-[9999px]"><label htmlFor="website">Leave this empty</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send inquiry"}</Button>
        <p className="text-xs text-muted-foreground">Used only to reply to you. Not added to any mailing list.</p>
      </div>
    </form>
  );
}
