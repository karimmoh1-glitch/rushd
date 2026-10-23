"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";

async function requireAdminOrThrow() {
  const user = await requireUserOrThrow();
  if (!user.isAdmin) {
    throw new Error("Forbidden");
  }
  return user;
}

/** Creates or updates one app-wide setting. */
async function saveSetting(key: string, value: boolean | number) {
  await db.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function setAiEnabled(enabled: boolean): Promise<{ success: true }> {
  await requireAdminOrThrow();
  await saveSetting("ai.enabled", Boolean(enabled));
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function setAiMonthlyBudget(usd: number): Promise<{ success: true } | { error: string }> {
  await requireAdminOrThrow();
  const parsed = z.number().finite().min(0).max(100_000).safeParse(usd);
  if (!parsed.success) {
    return { error: "Enter a budget between $0 and $100,000." };
  }
  await saveSetting("ai.monthlyBudgetUsd", parsed.data);
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function setInquiryStatus(id: string, status: "new" | "contacted" | "closed"): Promise<{ success: true }> {
  await requireAdminOrThrow();
  // parse() throws on bad input, same as an unauthorized call.
  const inquiryId = z.string().max(64).parse(id);
  const newStatus = z.enum(["new", "contacted", "closed"]).parse(status);
  await db.schoolInquiry.update({ where: { id: inquiryId }, data: { status: newStatus } });
  revalidatePath("/admin/growth");
  return { success: true };
}
