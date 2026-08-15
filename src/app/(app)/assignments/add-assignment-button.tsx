"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentDialog, type ClassOption } from "./assignment-dialog";

export function AddAssignmentButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={classes.length === 0}>
        <Plus className="h-4 w-4" />
        Add assignment
      </Button>
      <AssignmentDialog open={open} onOpenChange={setOpen} classes={classes} />
    </>
  );
}
