"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setClassArchived, deleteClass } from "@/server/actions/classes";
import { ClassDialog } from "./class-dialog";
import type { ClassInput } from "@/lib/validation/classes";

const PRIORITY_LABEL: Record<ClassInput["priority"], string> = {
  LOW: "Low priority",
  MEDIUM: "Medium priority",
  HIGH: "High priority",
};

export interface ClassCardData extends ClassInput {
  id: string;
  archived: boolean;
  assignmentCount: number;
  examCount: number;
}

export function ClassCard({ data }: { data: ClassCardData }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleArchived() {
    startTransition(async () => {
      const result = await setClassArchived(data.id, !data.archived);
      if ("error" in result) toast.error(result.error);
      else toast.success(data.archived ? "Class restored." : "Class archived.");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteClass(data.id);
      if ("error" in result) toast.error(result.error);
      else toast.success("Class deleted.");
    });
  }

  return (
    <>
      <Card className={data.archived ? "opacity-60" : undefined}>
        <CardContent className="flex items-center gap-3 py-4">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{data.name}</p>
              {data.priority === "HIGH" && (
                <Badge variant="outline" className="text-warning border-warning">
                  {PRIORITY_LABEL[data.priority]}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {[data.teacher, data.period].filter(Boolean).join(" · ") || "—"}
              {" · "}
              {data.assignmentCount} assignment{data.assignmentCount === 1 ? "" : "s"},{" "}
              {data.examCount} exam{data.examCount === 1 ? "" : "s"}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Options for ${data.name}`}
                  disabled={pending}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleArchived}>
                {data.archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDelete}
                disabled={data.assignmentCount > 0 || data.examCount > 0}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      <ClassDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={{
          id: data.id,
          name: data.name,
          teacher: data.teacher,
          period: data.period,
          color: data.color,
          priority: data.priority,
        }}
      />
    </>
  );
}
