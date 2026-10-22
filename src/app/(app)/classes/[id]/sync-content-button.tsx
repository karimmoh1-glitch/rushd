"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncCourseContentAction } from "@/server/actions/course";

export function SyncContentButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncCourseContentAction(classId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          const v = result.value;
          toast.success(
            `Synced ${v.modules} modules, ${v.pages} pages, ${v.assignments} assignments (${v.rubrics} with rubrics), ${v.announcements} announcements.`,
          );
        })
      }
    >
      <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
      {pending ? "Syncing…" : "Sync course content"}
    </Button>
  );
}
