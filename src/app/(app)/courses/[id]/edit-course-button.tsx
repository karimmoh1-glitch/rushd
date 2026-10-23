"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassDialog, type ClassDialogInitialData } from "../class-dialog";

/** Opens the same edit dialog the Courses list uses. */
export function EditCourseButton({ course, timeZone }: { course: ClassDialogInitialData; timeZone?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit course
      </Button>
      <ClassDialog open={open} onOpenChange={setOpen} initialData={course} timeZone={timeZone} />
    </>
  );
}
