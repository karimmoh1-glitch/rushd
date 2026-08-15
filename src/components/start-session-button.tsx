"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActiveSession } from "@/components/active-session-context";
import {
  startSession,
  type StudySessionSource,
} from "@/server/actions/study-sessions";

export function StartSessionButton({
  target,
  source,
  label = "Start",
  size = "sm",
  variant = "outline",
}: {
  target: { assignmentId: string } | { examId: string };
  source: StudySessionSource;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "outline" | "default" | "ghost";
}) {
  const { activeSession, setActiveSession } = useActiveSession();
  const [pending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      const result = await startSession(target, source);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setActiveSession(result.session);
      toast.success("Session started.");
    });
  }

  // A concurrent session already exists — the server would reject a second
  // start anyway (see study-sessions.ts), so disable rather than let the
  // student hit an error for something the UI already knows.
  const blocked = activeSession !== null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleStart}
      disabled={pending || blocked}
      title={blocked ? "Finish or abandon your current session first" : undefined}
    >
      <Play className="h-4 w-4" />
      {pending ? "Starting…" : label}
    </Button>
  );
}
