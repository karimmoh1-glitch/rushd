"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";

async function requireAdminOrThrow() {
  const user = await requireUserOrThrow();
  if (!user.isAdmin) throw new Error("Forbidden");
  return user;
}

export async function setAiEnabled(enabled: boolean): Promise<{ success: true }> {
  await requireAdminOrThrow();
  await db.appSetting.upsert({ where: { key: "ai.enabled" }, update: { value: Boolean(enabled) }, create: { key: "ai.enabled", value: Boolean(enabled) } });
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function setAiMonthlyBudget(usd: number): Promise<{ success: true } | { error: string }> {
  await requireAdminOrThrow();
  const parsed = z.number().finite().min(0).max(100_000).safeParse(usd);
  if (!parsed.success) return { error: "Enter a budget between $0 and $100,000." };
  await db.appSetting.upsert({ where: { key: "ai.monthlyBudgetUsd" }, update: { value: parsed.data }, create: { key: "ai.monthlyBudgetUsd", value: parsed.data } });
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function setInquiryStatus(id: string, status: "new" | "contacted" | "closed"): Promise<{ success: true }> {
  await requireAdminOrThrow();
  await db.schoolInquiry.update({ where: { id: z.string().max(64).parse(id) }, data: { status: z.enum(["new", "contacted", "closed"]).parse(status) } });
  revalidatePath("/admin/growth");
  return { success: true };
}
