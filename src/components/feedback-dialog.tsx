"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Star } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitFeedback } from "@/server/actions/feedback";
import { cn } from "@/lib/utils";

export function FeedbackDialog({
  context = "general",
  trigger,
}: {
  context?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitFeedback({ context, rating, message: message || undefined });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Thanks — that helps.");
      setRating(null);
      setMessage("");
      setOpen(false);
    });
  }

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Feedback
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                What&apos;s working, what&apos;s confusing, what should Rushd do
                better?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>How&apos;s Rushd been for you? (optional)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} out of 5`}
                      aria-pressed={rating === n}
                      onClick={() => setRating(rating === n ? null : n)}
                      className="p-0.5"
                    >
                      <Star
                        className={cn(
                          "h-6 w-6",
                          rating !== null && n <= rating
                            ? "fill-warning text-warning"
                            : "text-muted-foreground",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback-message">Message (optional)</Label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send feedback"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
