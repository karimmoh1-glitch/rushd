import * as z from "zod";

// What the import review screen may save. The items come from the browser
// (originally from an AI extraction the student edited), so every field is
// bounded like the hand-entry forms.

export const ImportItemSchema = z.object({
  kind: z.enum(["assignment", "exam"]),
  // Extracted titles can run long; keep the first 160 characters rather than refuse.
  title: z.string().trim().min(1, "Every item needs a title.").transform((title) => title.slice(0, 160)),
  classId: z.string().min(1, "Choose a course for every item.").max(64),
  dueAt: z.iso.datetime({ error: "One of the dates isn't valid." }),
  minutes: z.number().int().min(1).max(3000, "Estimates are limited to 3000 minutes."),
});

export const ImportItemsSchema = z
  .array(ImportItemSchema)
  .min(1, "Nothing to add.")
  .max(40, "Too many items at once.");

export type ImportItemInput = z.input<typeof ImportItemSchema>;

/** Generic id argument for server actions: a string, never an object that
 * Prisma would read as a filter (e.g. { not: "" }). */
export const IdSchema = z.string().min(1).max(64);
