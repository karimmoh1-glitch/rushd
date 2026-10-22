"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAssessment } from "@/server/actions/practice";

export function DeleteAssessmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this check? It will also stop counting toward your mastery.")) return;
        startTransition(async () => {
          const result = await deleteAssessment(id);
          if ("error" in result) toast.error(result.error);
          else router.push("/practice");
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      Delete this check
    </Button>
  );
}
