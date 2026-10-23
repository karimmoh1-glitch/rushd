"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentDialog, type ClassOption } from "./assignment-dialog";

export function AddAssignmentButton({
  classes,
  variant = "default",
  label = "Add assignment",
}: {
  classes: ClassOption[];
  variant?: "default" | "outline";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} disabled={classes.length === 0}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
      <AssignmentDialog open={open} onOpenChange={setOpen} classes={classes} />
    </>
  );
}
