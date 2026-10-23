"use server";

import { revalidatePath } from "next/cache";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { MAX_FILE_BYTES } from "@/lib/syllabus/extract-text";
import { confirmSyllabusImport, previewSyllabus, type ConfirmSummary, type SyllabusPreview } from "@/lib/syllabus/service";
import type { ConfirmSyllabusInput } from "@/lib/syllabus/confirm-schema";

// Thin wrappers: session, rate limit, then the syllabus service
// (src/lib/syllabus/service.ts), which checks course ownership and scopes
// every query by the student's userId. Ownership and "nothing saved before
// confirm" are tested against the service in service.integration.test.ts.

export type PreviewActionResult = { status: "ok"; preview: SyllabusPreview } | { status: "error"; error: string };
export type ConfirmActionResult = { status: "ok"; summary: ConfirmSummary } | { status: "error"; error: string };

const HOUR = 60 * 60 * 1000;

/** Reads an uploaded or pasted syllabus into a draft. Saves nothing the student owns. */
export async function previewSyllabusAction(formData: FormData): Promise<PreviewActionResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`syllabus-preview:${user.id}`, { max: 15, windowMs: HOUR });
  if (!rate.allowed) return { status: "error", error: "You've read a lot of syllabi this hour. Try again in a little while." };

  const classId = formData.get("classId");
  if (typeof classId !== "string" || !classId || classId.length > 64) return { status: "error", error: "Choose a course first." };
  const file = formData.get("file");
  const text = formData.get("text");

  if (file instanceof File && file.size > 0) {
    // Checked before reading the body into memory.
    if (file.size > MAX_FILE_BYTES) return { status: "error", error: "That file is over the 3.5 MB limit. Upload just the syllabus, or paste the text." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await previewSyllabus(user.id, { classId, file: { bytes, name: file.name ?? "" } });
    return result.ok ? { status: "ok", preview: result.preview } : { status: "error", error: result.error };
  }
  if (typeof text === "string" && text.trim()) {
    const result = await previewSyllabus(user.id, { classId, text });
    return result.ok ? { status: "ok", preview: result.preview } : { status: "error", error: result.error };
  }
  return { status: "error", error: "Upload your syllabus or paste its text." };
}

/** Saves the rows the student kept on the review screen. */
export async function confirmSyllabusAction(input: ConfirmSyllabusInput): Promise<ConfirmActionResult> {
  const user = await requireUserOrThrow();
  const rate = await checkRateLimit(`syllabus-confirm:${user.id}`, { max: 20, windowMs: HOUR });
  if (!rate.allowed) return { status: "error", error: "Too many imports this hour. Try again in a little while." };
  const result = await confirmSyllabusImport(user.id, input);
  if (!result.ok) return { status: "error", error: result.error };
  revalidatePath(`/courses/${input.classId}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath("/assignments");
  revalidatePath("/exams");
  revalidatePath("/plan");
  revalidatePath("/mastery");
  return { status: "ok", summary: result.summary };
}
