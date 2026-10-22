"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { regeneratePlanSnapshot } from "@/server/actions/plans";
import {
  connectCanvas as connectService,
  refreshCanvasCourses,
  setSelectedCanvasCourses,
  runCanvasSync,
  disconnectCanvas as disconnectService,
  type SyncReport,
} from "@/lib/canvas/service";

// Server actions for the Canvas integration. Identity always comes from the
// session cookie (requireUserOrThrow), never from arguments. Next.js rejects
// cross-origin Server Action POSTs (Origin vs Host check) and the session
// cookie is SameSite=Lax, which together cover CSRF for these mutations.
//
// The token argument to connectCanvas is the only time the raw token crosses
// into the server; it is validated, used to verify the connection, encrypted,
// and dropped. Nothing returned from any action contains it.

export type CanvasActionResult<T = undefined> =
  | { error: string; code?: string }
  | (T extends undefined ? { success: true } : { success: true; data: T });

function revalidateAll() {
  for (const p of ["/integrations/canvas", "/dashboard", "/plan", "/assignments", "/classes", "/settings"]) {
    revalidatePath(p);
  }
}

const ConnectSchema = z.object({
  baseUrl: z.string().trim().min(1, "Enter your school's Canvas address.").max(300),
  token: z.string().trim().min(1, "Paste your Canvas access token.").max(512),
});

export async function connectCanvas(
  input: z.infer<typeof ConnectSchema>,
): Promise<CanvasActionResult<{ canvasUserName: string; courseCount: number }>> {
  const user = await requireUserOrThrow();
  const rate = checkRateLimit(`canvas-connect:${user.id}`);
  if (!rate.allowed) return { error: "Too many attempts. Try again in a few minutes." };

  const parsed = ConnectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const result = await connectService(user.id, parsed.data.baseUrl, parsed.data.token);
  if (!result.ok) {
    await logEvent(user.id, "canvas_connect_failed", { code: result.code ?? "UNKNOWN" });
    return { error: result.error, code: result.code };
  }
  await logEvent(user.id, "canvas_connected", { courseCount: result.value.courseCount });
  revalidateAll();
  return { success: true, data: result.value };
}

export async function refreshCourses(): Promise<CanvasActionResult<{ courseCount: number }>> {
  const user = await requireUserOrThrow();
  const rate = checkRateLimit(`canvas-refresh:${user.id}`);
  if (!rate.allowed) return { error: "Too many refreshes. Try again in a few minutes." };
  const result = await refreshCanvasCourses(user.id);
  if (!result.ok) return { error: result.error, code: result.code };
  revalidateAll();
  return { success: true, data: result.value };
}

const SelectionSchema = z.object({
  courseIds: z.array(z.string().min(1).max(64)).max(50, "Select 50 courses or fewer."),
});

export async function saveCourseSelection(
  input: z.infer<typeof SelectionSchema>,
): Promise<CanvasActionResult<{ selected: number; classesCreated: number }>> {
  const user = await requireUserOrThrow();
  const parsed = SelectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const result = await setSelectedCanvasCourses(user.id, parsed.data.courseIds);
  if (!result.ok) return { error: result.error };
  revalidateAll();
  return { success: true, data: result.value };
}

/** Fetches from Canvas and returns what a sync WOULD change, plus how the
 * plan would shift. Writes nothing. */
export async function previewCanvasSync(): Promise<CanvasActionResult<SyncReport>> {
  const user = await requireUserOrThrow();
  const rate = checkRateLimit(`canvas-sync:${user.id}`);
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const result = await runCanvasSync(user.id, { dryRun: true });
  if (!result.ok) {
    if (result.code === "UNAUTHORIZED") revalidateAll();
    return { error: result.error, code: result.code };
  }
  return { success: true, data: result.value };
}

/** Applies the sync the student just reviewed. Re-fetches from Canvas (so
 * nothing stale is written) and applies in a single transaction. */
export async function applyCanvasSync(): Promise<CanvasActionResult<SyncReport>> {
  const user = await requireUserOrThrow();
  const rate = checkRateLimit(`canvas-sync:${user.id}`);
  if (!rate.allowed) return { error: "Syncing too often. Try again in a few minutes." };
  const result = await runCanvasSync(user.id, { dryRun: false });
  if (!result.ok) {
    revalidateAll();
    return { error: result.error, code: result.code };
  }
  const s = result.value.summary;
  await logEvent(user.id, "canvas_synced", {
    created: s.created,
    updated: s.updated,
    completed: s.completed,
    removed: s.removed,
    coursesFailed: s.coursesFailed,
  });
  await regeneratePlanSnapshot(user.id);
  revalidateAll();
  return { success: true, data: result.value };
}

const DisconnectSchema = z.object({ removeImported: z.boolean() });

export async function disconnectCanvas(
  input: z.infer<typeof DisconnectSchema>,
): Promise<CanvasActionResult<{ removedAssignments: number }>> {
  const user = await requireUserOrThrow();
  const parsed = DisconnectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };
  const result = await disconnectService(user.id, parsed.data);
  if (!result.ok) return { error: result.error };
  await logEvent(user.id, "canvas_disconnected", { removedAssignments: result.value.removedAssignments });
  await regeneratePlanSnapshot(user.id);
  revalidateAll();
  return { success: true, data: result.value };
}
