"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { aiProvider, type CallUsage } from "@/lib/ai";
import { failAi, reserveAi, settleAi } from "@/lib/ai/usage";
import { fallbackParseQuickAdd } from "@/lib/ai/fallback-parse";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import type { QuickAddDraft } from "@/lib/ai/schemas";

export interface QuickAddResult {
  draft: QuickAddDraft;
  usedAI: boolean;
}

/** Turns quick-add text into a draft for the student to review. Tries AI first,
 * then falls back to the simple parser, so it always returns a draft. Saves nothing. */
/** The quick-add box allows 300 characters; anything longer is cut, never sent whole to the AI. */
const MAX_QUICK_ADD_CHARS = 300;
/** Typing-speed use stays far below this; scripts don't. Over it, only the free parser runs. */
const QUICK_ADD_AI_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };

export async function parseQuickAdd(text: string): Promise<QuickAddResult> {
  const user = await requireUserOrThrow();
  const trimmed = (typeof text === "string" ? text : "").trim().slice(0, MAX_QUICK_ADD_CHARS);
  const now = new Date();

  const classes = await db.class.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, name: true },
  });

  if (aiEnabled && trimmed.length > 0 && (await checkRateLimit(`quick-add:${user.id}`, QUICK_ADD_AI_LIMIT)).allowed) {
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
