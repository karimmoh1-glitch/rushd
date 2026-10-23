"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassDialog, type CourseContext } from "./class-dialog";

export function AddClassButton({ timeZone, context }: { timeZone?: string; context?: CourseContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add course
      </Button>
      <ClassDialog open={open} onOpenChange={setOpen} timeZone={timeZone} context={context} />
    </>
  );
}
