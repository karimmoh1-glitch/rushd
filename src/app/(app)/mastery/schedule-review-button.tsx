"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleTopicReview } from "@/server/actions/practice";

export function ScheduleReviewButton({ topicKey, size = "default" }: { topicKey: string; size?: "default" | "sm" }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await scheduleTopicReview(topicKey);
      if ("error" in result) toast.error(result.error);
      else toast.success("Added a 30-minute review to your study plan.");
    });
  }

  return (
    <Button variant="outline" size={size} disabled={pending} onClick={handleClick}>
      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
      {pending ? "Adding…" : "Add a review to my plan"}
    </Button>
  );
}
