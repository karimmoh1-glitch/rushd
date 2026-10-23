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
  const pages = ["/integrations/teams", "/dashboard", "/assignments", "/plan", "/courses", "/settings"];
  for (const page of pages) {
    revalidatePath(page);
  }
}

export async function saveTeamsClasses(rowIds: string[]): Promise<Result<{ selected: number }>> {
  const user = await requireUserOrThrow();
  const parsed = z.array(z.string().max(64)).max(50).safeParse(rowIds);
  if (!parsed.success) return { error: "Invalid selection." };
  const result = await setSelectedTeamsClasses(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidateAll();
  return { success: true, value: result.value };
}

export async function syncTeams(): Promise<Result<TeamsSyncSummary>> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`teams-sync:${user.id}`);
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const result = await runTeamsSync(user.id);
  if (!result.ok) {
    revalidateAll();
    return { error: result.error };
  }
  await logEvent(user.id, "teams_synced", { ...result.value });
  await regeneratePlanSnapshot(user.id).catch(() => {});
  revalidateAll();
  return { success: true, value: result.value };
}

export async function refreshTeams(): Promise<Result<{ classCount: number }>> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`teams-refresh:${user.id}`);
  if (!rate.allowed) return { error: "Too many refreshes. Try again in a few minutes." };
  const result = await refreshTeamsClasses(user.id);
  if (!result.ok) return { error: result.error };
  revalidateAll();
  return { success: true, value: result.value };
}

export async function disconnectTeamsAction(removeAssignments: boolean): Promise<Result<{ removed: number }>> {
  const user = await requireUserOrThrow();
  const result = await disconnectTeams(user.id, Boolean(removeAssignments));
  if (!result.ok) return { error: result.error };
  await logEvent(user.id, "teams_disconnected", { removed: result.value.removed });
  revalidateAll();
  return { success: true, value: result.value };
}
