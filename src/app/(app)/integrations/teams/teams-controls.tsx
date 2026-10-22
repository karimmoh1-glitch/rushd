"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectTeamsAction, refreshTeams, saveTeamsClasses, syncTeams } from "@/server/actions/teams";

export function TeamsControls({ classes }: { classes: { id: string; name: string; selected: boolean }[] }) {
  const [selected, setSelected] = useState(() => new Set(classes.filter((c) => c.selected).map((c) => c.id)));
  const [pending, startTransition] = useTransition();
  const dirty = classes.some((c) => c.selected !== selected.has(c.id));

  const run = (fn: () => Promise<void>) => startTransition(fn);

  return (
    <div className="space-y-8">
      <section aria-labelledby="classes" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 id="classes" className="text-base font-semibold">Classes</h2>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            disabled={pending}
            onClick={() => run(async () => {
              const r = await refreshTeams();
              if ("error" in r) toast.error(r.error);
              else toast.success(`Found ${r.value.classCount} classes.`);
            })}
          >
            Refresh list
          </button>
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Teams classes found for this account.</p>
        ) : (
          <ul className="divide-y divide-border">
            {classes.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={(e) => setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={dirty ? "default" : "outline"}
            disabled={pending || !dirty}
            onClick={() => run(async () => {
              const r = await saveTeamsClasses([...selected]);
              if ("error" in r) toast.error(r.error);
              else toast.success("Saved. Each class syncs into a Rushd course with the same name.");
            })}
          >
            Save selection
          </Button>
          <Button
            variant={dirty ? "outline" : "default"}
            disabled={pending || dirty || selected.size === 0}
            onClick={() => run(async () => {
              const r = await syncTeams();
              if ("error" in r) toast.error(r.error);
              else {
                const v = r.value;
                toast.success(`Synced: ${v.created} new, ${v.updated} updated${v.completed ? `, ${v.completed} turned in` : ""}${v.skippedNoDueDate ? `, ${v.skippedNoDueDate} without a due date skipped` : ""}.`);
              }
            })}
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
          {[false, true].map((remove) => (
            <Button
              key={String(remove)}
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(remove ? "Disconnect and delete assignments imported from Teams?" : "Disconnect and keep imported assignments as your own?")) return;
                run(async () => {
                  const r = await disconnectTeamsAction(remove);
                  if ("error" in r) toast.error(r.error);
                  else toast.success("Teams disconnected.");
                });
              }}
            >
              {remove ? "Disconnect and remove assignments" : "Disconnect, keep assignments"}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
