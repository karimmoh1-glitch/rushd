// Matches a class name from a pasted week ("Chemistry", guessed from
// "AP Chemistry quiz in 4 days") to the student's existing courses, so adding
// a week doesn't create a duplicate "Chemistry" next to "AP Chemistry".

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The id of the course this name refers to: an exact (case-insensitive)
 * match, else the only course whose name contains it as a whole word.
 * Null when there's no match or it's ambiguous. */
export function matchExistingClass(name: string, existing: { id: string; name: string }[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const exact = existing.find((cls) => cls.name.trim().toLowerCase() === wanted);
  if (exact) return exact.id;
  const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(wanted)}($|[^\\p{L}\\p{N}])`, "iu");
  const contains = existing.filter((cls) => word.test(cls.name));
  return contains.length === 1 ? contains[0].id : null;
}
