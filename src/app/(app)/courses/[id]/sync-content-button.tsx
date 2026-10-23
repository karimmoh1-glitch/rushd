"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncCourseContentAction } from "@/server/actions/course";

export function SyncContentButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const result = await syncCourseContentAction(classId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const counts = result.value;
      toast.success(
        `Synced ${counts.modules} modules, ${counts.pages} pages, ${counts.assignments} assignments (${counts.rubrics} with rubrics), ${counts.announcements} announcements.`,
      );
    });
  }

  return (
    <Button variant="outline" disabled={pending} onClick={handleSync}>
      <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
      {pending ? "Syncing…" : "Sync course content"}
    </Button>
  );
}
