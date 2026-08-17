"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { CreateInviteCodeSchema, type CreateInviteCodeInput } from "@/lib/validation/invite-code";

export type ActionResult = { error: string } | { success: true };

function generateCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function createInviteCode(input: CreateInviteCodeInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = CreateInviteCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db.inviteCode.create({
    data: {
      code: generateCode(),
      label: parsed.data.label || null,
      maxUses: parsed.data.maxUses ?? null,
    },
  });

  revalidatePath("/admin");
  return { success: true };
}
