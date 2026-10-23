"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startSessionAction } from "@/server/actions/learning";

/** Starts a practice session and opens it. */
export function StartPracticeButton({
  classId,
  topicId,
  questionIds,
  mode = "practice",
  label,
  variant = "outline",
  size = "default",
  className,
}: {
  classId: string;
  topicId?: string | null;
  questionIds?: string[];
  mode?: "practice" | "review" | "mistakes";
  label: string;
  variant?: "signal" | "outline" | "ghost" | "default";
  size?: "default" | "sm";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function start() {
    startTransition(async () => {
      const result = await startSessionAction({ classId, topicId, mode, questionIds });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.push(`/courses/${classId}/practice/${result.id}`);
    });
  }
  return (
    <Button variant={variant} size={size} onClick={start} disabled={pending} className={className}>
      {pending ? "Starting…" : label}
    </Button>
  );
}
