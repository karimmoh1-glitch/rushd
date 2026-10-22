"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { aiProvider, type CallUsage } from "@/lib/ai";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { fallbackParseQuickAdd } from "@/lib/ai/fallback-parse";
import type { QuickAddDraft } from "@/lib/ai/schemas";

export interface QuickAddResult {
  draft: QuickAddDraft;
  usedAI: boolean;
}

/**
 * Parses free-text quick-add input into a structured draft. Tries AI first
 * if configured; always falls back to the deterministic parser if AI is
 * unavailable, errors, or returns something that fails validation — the
 * caller always gets a usable draft, never an error. The draft is only ever
 * a *preview*: nothing is written to the database here, matching "always
 * show the parsed result before committing it."
 */
export async function parseQuickAdd(text: string): Promise<QuickAddResult> {
  const user = await requireUserOrThrow();
  const trimmed = text.trim();
  const now = new Date();

  const classes = await db.class.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, name: true },
  });

  if (aiEnabled) {
    // Over quota or AI paused: the deterministic parser still works.
    const reservation = await reserveAi(user.id, "quick_add", now);
    if (reservation.ok) {
      let usage: CallUsage | undefined;
      const aiDraft = await aiProvider.parseQuickAdd(trimmed, classes, now, (u) => (usage = u));
      if (usage) await settleAi(reservation.usageId, usage.model, usage);
      else await failAi(reservation.usageId, "no_response");
      if (aiDraft) return { draft: aiDraft, usedAI: true };
    }
  }

  return { draft: fallbackParseQuickAdd(trimmed, classes, now), usedAI: false };
}
