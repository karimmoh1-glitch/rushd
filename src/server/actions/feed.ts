"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { connectFeed, disconnectFeed, runFeedSync, type FeedSyncSummary } from "@/lib/feed/service";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

type Result<T> = { success: true; value: T } | { error: string };

function revalidateAll() {
  const pages = ["/integrations/canvas-calendar", "/dashboard", "/assignments", "/plan", "/courses", "/settings"];
  for (const page of pages) {
    revalidatePath(page);
  }
}

export async function connectFeedAction(url: string): Promise<Result<FeedSyncSummary>> {
  const user = await requireUserOrThrow();
  const parsed = z.string().trim().min(1).max(500).safeParse(url);
  if (!parsed.success) return { error: "Paste your Canvas calendar feed link." };
  const rate = await checkRateLimit(`feed-connect:${user.id}`);
  if (!rate.allowed) return { error: "Too many tries. Wait a few minutes and try again." };
  const result = await connectFeed(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  await logEvent(user.id, "canvas_feed_connected", { ...result.value });
  await logEvent(user.id, "canvas_synced", { via: "feed", ...result.value });
  await regeneratePlanSnapshot(user.id).catch(() => {});
  revalidateAll();
  return { success: true, value: result.value };
}

export async function syncFeedAction(): Promise<Result<FeedSyncSummary>> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`feed-sync:${user.id}`);
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const result = await runFeedSync(user.id);
  revalidateAll();
  if (!result.ok) return { error: result.error };
  await logEvent(user.id, "canvas_synced", { via: "feed", ...result.value });
  await regeneratePlanSnapshot(user.id).catch(() => {});
  return { success: true, value: result.value };
}

export async function disconnectFeedAction(removeAssignments: boolean): Promise<Result<{ removed: number }>> {
  const user = await requireUserOrThrow();
  const result = await disconnectFeed(user.id, removeAssignments === true);
  if (!result.ok) return { error: result.error };
  await regeneratePlanSnapshot(user.id).catch(() => {});
  revalidateAll();
  return { success: true, value: result.value };
}
