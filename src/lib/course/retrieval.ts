import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { readStoredRubric, type RubricCriterion } from "@/lib/canvas/content";

// Search and read mirrored course content. Every query is scoped to the
// session's userId, so an id from a model or client is always re-checked for ownership.

export type MaterialKind = "MODULE_ITEM" | "PAGE" | "ASSIGNMENT" | "ANNOUNCEMENT";

export interface MaterialHit {
  id: string;
  kind: MaterialKind;
  title: string;
  className: string;
  url: string | null;
  excerpt: string;
}

export interface MaterialDetail {
  id: string;
  kind: MaterialKind;
  title: string;
  className: string;
  classId: string;
  url: string | null;
  body: string;
  postedAt: Date | null;
  pointsPossible: number | null;
  rubric: RubricCriterion[] | null;
}

const MAX_TERMS = 12;

/** Turns free text into an OR search ("a | b | c"), since a question rarely has
 * every word of its answer. Only a-z/0-9 words survive, so the tsquery is always valid. */
function toOrQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 40);
  const terms: string[] = [];
  for (const word of words) {
    if (terms.includes(word)) continue;
    if (!/^[a-z0-9]+$/.test(word)) continue;
    terms.push(word);
  }
  const firstTerms = terms.slice(0, MAX_TERMS);
  if (firstTerms.length === 0) return null;
  return firstTerms.join(" | ");
}

export async function searchMaterials(
  userId: string,
  { query, classId, limit = 6 }: { query: string; classId?: string | null; limit?: number },
): Promise<MaterialHit[]> {
  const tsquery = toOrQuery(query);
  if (!tsquery) return [];
  const take = Math.max(1, Math.min(10, limit));
  const classFilter = classId ? Prisma.sql`AND m."classId" = ${classId}` : Prisma.empty;
  const rows = await db.$queryRaw<
    { id: string; kind: MaterialKind; title: string; url: string | null; className: string; excerpt: string }[]
  >`
    SELECT m.id, m.kind, m.title, m.url, c.name AS "className",
      ts_headline('english', coalesce(m.body, ''), q,
        'StartSel="", StopSel="", MaxWords=45, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "') AS excerpt
    FROM "CourseMaterial" m
    JOIN "Class" c ON c.id = m."classId" AND c."userId" = ${userId}
    CROSS JOIN to_tsquery('english', ${tsquery}) q
    WHERE m."userId" = ${userId} ${classFilter} AND m."searchVector" @@ q
    ORDER BY ts_rank_cd(m."searchVector", q) DESC, m."postedAt" DESC NULLS LAST
    LIMIT ${take}`;
  return rows.map((row) => ({ ...row, excerpt: row.excerpt.trim() }));
}

export async function getMaterial(
  userId: string,
  id: string,
  { classId }: { classId?: string | null } = {},
): Promise<MaterialDetail | null> {
  const classFilter = classId ? { classId } : {};
  const row = await db.courseMaterial.findFirst({
    where: { id, userId, ...classFilter },
    select: {
      id: true,
      kind: true,
      title: true,
      url: true,
      body: true,
      postedAt: true,
      pointsPossible: true,
      rubric: true,
      classId: true,
      class: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    className: row.class.name,
    classId: row.classId,
    url: row.url,
    body: row.body ?? "",
    postedAt: row.postedAt,
    pointsPossible: row.pointsPossible,
    rubric: readStoredRubric(row.rubric),
  };
}

/** The mirrored Canvas assignment (description + rubric) for one of the
 * user's assignments, if it came from Canvas and content has been synced. */
export async function getAssignmentMaterial(userId: string, assignmentId: string): Promise<MaterialDetail | null> {
  const row = await db.courseMaterial.findFirst({
    where: { userId, kind: "ASSIGNMENT", assignmentId },
    select: { id: true },
  });
  if (!row) return null;
  return getMaterial(userId, row.id);
}
