"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassDialog } from "./class-dialog";

export function AddClassButton({ timeZone }: { timeZone?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add course
      </Button>
      <ClassDialog open={open} onOpenChange={setOpen} timeZone={timeZone} />
    </>
  );
}
