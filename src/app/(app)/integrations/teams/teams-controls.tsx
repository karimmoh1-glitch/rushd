"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectTeamsAction, refreshTeams, saveTeamsClasses, syncTeams } from "@/server/actions/teams";

const DISCONNECT_OPTIONS = [
  {
    removeImported: false,
    confirmText: "Disconnect and keep imported assignments as your own?",
    label: "Disconnect, keep assignments",
  },
  {
    removeImported: true,
    confirmText: "Disconnect and delete assignments imported from Teams?",
    label: "Disconnect and remove assignments",
  },
];

// e.g. "Synced: 3 new, 1 updated, 2 turned in."
function describeSync(result: { created: number; updated: number; completed: number; skippedNoDueDate: number }): string {
  let text = `Synced: ${result.created} new, ${result.updated} updated`;
  if (result.completed) text += `, ${result.completed} turned in`;
  if (result.skippedNoDueDate) text += `, ${result.skippedNoDueDate} without a due date skipped`;
  return `${text}.`;
}

export function TeamsControls({ classes }: { classes: { id: string; name: string; selected: boolean }[] }) {
  const [selected, setSelected] = useState(() => new Set(classes.filter((c) => c.selected).map((c) => c.id)));
  const [pending, startTransition] = useTransition();
  // True when the checkboxes differ from what is saved.
  const dirty = classes.some((c) => c.selected !== selected.has(c.id));

  function toggleClass(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleRefresh() {
    startTransition(async () => {
      const result = await refreshTeams();
      if ("error" in result) toast.error(result.error);
      else toast.success(`Found ${result.value.classCount} classes.`);
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveTeamsClasses([...selected]);
      if ("error" in result) toast.error(result.error);
      else toast.success("Saved. Each class syncs into a Rushd course with the same name.");
    });
  }

  function handleSync() {
    startTransition(async () => {
      const result = await syncTeams();
      if ("error" in result) toast.error(result.error);
      else toast.success(describeSync(result.value));
    });
  }

  function handleDisconnect(removeImported: boolean, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await disconnectTeamsAction(removeImported);
      if ("error" in result) toast.error(result.error);
      else toast.success("Teams disconnected.");
    });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="classes" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 id="classes" className="text-base font-semibold">Classes</h2>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            disabled={pending}
            onClick={handleRefresh}
          >
            Refresh list
          </button>
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Teams classes found for this account.</p>
        ) : (
          <ul className="divide-y divide-border">
            {classes.map((teamsClass) => (
              <li key={teamsClass.id}>
                <label className="flex items-center gap-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(teamsClass.id)}
                    onChange={(e) => toggleClass(teamsClass.id, e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {teamsClass.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={dirty ? "default" : "outline"}
            disabled={pending || !dirty}
            onClick={handleSave}
          >
            Save selection
          </Button>
          <Button
            variant={dirty ? "outline" : "default"}
            disabled={pending || dirty || selected.size === 0}
            onClick={handleSync}
          >
            {pending ? "Working…" : "Sync now"}
          </Button>
        </div>
      </section>

      <section aria-labelledby="disconnect" className="space-y-3 border-t border-border pt-6">
        <h2 id="disconnect" className="text-base font-semibold">Disconnect</h2>
        <p className="text-sm text-muted-foreground">
          Deletes Rushd&apos;s stored Microsoft sign-in right away. To fully revoke access, also remove Rushd at
          myapps.microsoft.com.
        </p>
        <div className="flex flex-wrap gap-2">
          {DISCONNECT_OPTIONS.map((option) => (
            <Button
              key={option.label}
              variant="outline"
              disabled={pending}
              onClick={() => handleDisconnect(option.removeImported, option.confirmText)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
