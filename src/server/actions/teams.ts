"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { disconnectTeams, refreshTeamsClasses, runTeamsSync, setSelectedTeamsClasses, type TeamsSyncSummary } from "@/lib/teams/service";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

type Result<T> = { success: true; value: T } | { error: string };

function revalidateAll() {
  for (const p of ["/integrations/teams", "/dashboard", "/assignments", "/plan", "/courses", "/settings"]) revalidatePath(p);
}

export async function saveTeamsClasses(rowIds: string[]): Promise<Result<{ selected: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z.array(z.string().max(64)).max(50).safeParse(rowIds);
  if (!parsed.success) return { error: "Invalid selection." };
  const r = await setSelectedTeamsClasses(user.id, parsed.data);
  if (!r.ok) return { error: r.error };
  revalidateAll();
  return { success: true, value: r.value };
}

export async function syncTeams(): Promise<Result<TeamsSyncSummary>> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`teams-sync:${user.id}`);
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const r = await runTeamsSync(user.id);
  if (!r.ok) {
    revalidateAll();
    return { error: r.error };
  }
  await logEvent(user.id, "teams_synced", { ...r.value });
  await regeneratePlanSnapshot(user.id).catch(() => {});
  revalidateAll();
  return { success: true, value: r.value };
}

export async function refreshTeams(): Promise<Result<{ classCount: number }>> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`teams-refresh:${user.id}`);
  if (!rate.allowed) return { error: "Too many refreshes. Try again in a few minutes." };
  const r = await refreshTeamsClasses(user.id);
  if (!r.ok) return { error: r.error };
  revalidateAll();
  return { success: true, value: r.value };
}

export async function disconnectTeamsAction(removeAssignments: boolean): Promise<Result<{ removed: number }>> {
  const user = await requireUserOrThrow();
  const r = await disconnectTeams(user.id, Boolean(removeAssignments));
  if (!r.ok) return { error: r.error };
  await logEvent(user.id, "teams_disconnected", { removed: r.value.removed });
  revalidateAll();
  return { success: true, value: r.value };
}
