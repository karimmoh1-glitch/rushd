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

/** Turns quick-add text into a draft for the student to review. Tries AI first,
 * then falls back to the simple parser, so it always returns a draft. Saves nothing. */
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
      // The provider reports token usage through this callback, if it answered at all.
      let usage: CallUsage | undefined;
      const aiDraft = await aiProvider.parseQuickAdd(trimmed, classes, now, (callUsage) => {
        usage = callUsage;
      });
      if (usage) {
        await settleAi(reservation.usageId, usage.model, usage);
      } else {
        await failAi(reservation.usageId, "no_response");
      }
      if (aiDraft) {
        return { draft: aiDraft, usedAI: true };
      }
    }
  }

  return { draft: fallbackParseQuickAdd(trimmed, classes, now), usedAI: false };
}
