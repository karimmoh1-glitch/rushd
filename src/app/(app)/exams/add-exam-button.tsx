"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExamDialog, type ClassOption } from "./exam-dialog";

export function AddExamButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={classes.length === 0}>
        <Plus className="h-4 w-4" />
        Add exam
      </Button>
      <ExamDialog open={open} onOpenChange={setOpen} classes={classes} />
    </>
  );
}
