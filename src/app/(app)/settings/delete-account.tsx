"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccount } from "@/server/actions/settings";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount(confirmText);
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account</DialogTitle>
            <DialogDescription>
              This permanently deletes your classes, assignments, exams,
              plans, and feedback. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending || confirmText !== "DELETE"}
            >
              {pending ? "Deleting…" : "Permanently delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
