// The course catalog: normalized, typed records kept in the repo (versioned and
// reviewable). Official records come from named curriculum providers; every
// other record is a generic template with nothing institution-specific.
// Adding courses: see docs/CATALOG.md.

import { AP_COURSES } from "./data/ap";
import { IB_COURSES } from "./data/ib";
import { HIGH_SCHOOL_COURSES, HONORS_COURSES, MIDDLE_SCHOOL_COURSES } from "./data/secondary";
import { ASSOCIATE_COURSES, COLLEGE_INTRO_COURSES, GRADUATE_COURSES, PROFESSIONAL_COURSES, UNDERGRADUATE_COURSES } from "./data/college";
import type { CatalogRecord } from "./types";

export * from "./levels";
export * from "./types";
export { SOURCES, type SourceId } from "./sources";

export const CATALOG: readonly CatalogRecord[] = [
  ...AP_COURSES,
  ...IB_COURSES,
  ...MIDDLE_SCHOOL_COURSES,
  ...HIGH_SCHOOL_COURSES,
  ...HONORS_COURSES,
  ...COLLEGE_INTRO_COURSES,
  ...ASSOCIATE_COURSES,
  ...UNDERGRADUATE_COURSES,
  ...GRADUATE_COURSES,
  ...PROFESSIONAL_COURSES,
];

const BY_ID = new Map(CATALOG.map((record) => [record.id, record]));

export function catalogRecord(id: string | null | undefined): CatalogRecord | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isCatalogId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
