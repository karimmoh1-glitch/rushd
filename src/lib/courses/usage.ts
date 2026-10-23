import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { isCatalogId, type CourseLevelValue } from "@/lib/courses/catalog";

// Real usage behind the course picker: a student's own recent courses, and
// which catalog courses students actually chose. Nothing here is invented:
// a course only shows as popular once enough real accounts picked it.

/** A catalog course counts as popular only when at least this many real students chose it. */
export const POPULAR_MIN_STUDENTS = 5;

// Staff, test, and e2e accounts never count (same rule as the analytics funnel).
const REAL = Prisma.sql`u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'`;

export interface PopularCourse {
  catalogId: string;
  students: number;
}

/** Catalog courses chosen by at least POPULAR_MIN_STUDENTS real students, most chosen first. */
export async function popularCatalogCourses(limit = 8, minStudents = POPULAR_MIN_STUDENTS): Promise<PopularCourse[]> {
  try {
    const rows = await db.$queryRaw<{ catalogId: string; students: bigint }[]>`
      SELECT c."catalogId" AS "catalogId", COUNT(DISTINCT c."userId") AS students
      FROM "Class" c JOIN "User" u ON u.id = c."userId"
      WHERE c."catalogId" IS NOT NULL AND ${REAL}
      GROUP BY c."catalogId"
      HAVING COUNT(DISTINCT c."userId") >= ${minStudents}
      ORDER BY students DESC, c."catalogId" ASC
      LIMIT ${limit}`;
    // Ids from removed catalog records are skipped rather than shown.
    return rows.filter((row) => isCatalogId(row.catalogId)).map((row) => ({ catalogId: row.catalogId, students: Number(row.students) }));
  } catch (error) {
    // Popular courses are a nicety; the picker works without them.
    console.error("[courses] popular courses query failed", error);
    return [];
  }
}

export interface OwnCourse {
  id: string;
  name: string;
  catalogId: string | null;
  code: string | null;
  institution: string | null;
  level: CourseLevelValue | null;
  archived: boolean;
}

/** The student's own courses, most recently added first. */
export async function recentOwnCourses(userId: string, limit = 50): Promise<OwnCourse[]> {
  return db.class.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, catalogId: true, code: true, institution: true, level: true, archived: true },
  });
}
