"use server";

import * as z from "zod";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/server/actions/client-ip";

const InquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase().max(200),
  role: z.string().trim().min(2, "Enter your role.").max(120),
  organization: z.string().trim().min(2, "Enter your school or organization.").max(200),
  studentCount: z.string().trim().max(40).optional(),
  interest: z.enum(["pilot", "information", "partnership"]),
  message: z.string().trim().min(10, "Tell us a little about what you're looking for.").max(3000),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

export type InquiryState = { ok?: boolean; error?: string } | undefined;

export async function submitSchoolInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  const ip = await getClientIp();
  const rate = await checkRateLimit(`school-inquiry:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return { error: "Too many submissions. Try again later." };
  }

  const parsed = InquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const form = parsed.data;

  // Every field except the honeypot is saved.
  await db.schoolInquiry.create({
    data: {
      name: form.name,
      email: form.email,
      role: form.role,
      organization: form.organization,
      studentCount: form.studentCount || null,
      interest: form.interest,
      message: form.message,
    },
  });
  return { ok: true };
}
