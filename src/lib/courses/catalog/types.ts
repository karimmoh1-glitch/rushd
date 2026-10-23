// The shape of the course catalog. Records are typed data in the repo, so
// every change is versioned and reviewed. See docs/CATALOG.md.

import type { CourseLevelValue } from "./levels";
import type { SourceId } from "./sources";

/** Disciplines used to group and label courses. Add new ones at the end. */
export const SUBJECTS = [
  "Math",
  "Science",
  "Computer Science",
  "Engineering",
  "English",
  "History and Social Studies",
  "Economics",
  "Business",
  "Psychology",
  "World Languages",
  "Arts",
  "Humanities",
  "Health and Medicine",
  "Law",
  "Education",
  "Physical Education and Health",
  "Technology",
  "Capstone",
  "Core",
  "Test Prep",
] as const;

export type Subject = (typeof SUBJECTS)[number];

/**
 * official: the course is defined by a named curriculum provider (College
 *   Board's AP course list, the IB Diploma Programme subject list).
 * template: a common course name with nothing institution-specific. Its real
 *   content depends on the student's school, which Rushd doesn't know.
 */
export type CatalogKind = "official" | "template";

export interface CatalogRecord {
  /** Stable id stored on Class.catalogId. Never change or reuse one. */
  id: string;
  title: string;
  /** Other names students type: abbreviations, nicknames, older names. */
  aliases: string[];
  subject: Subject;
  /** The levels this record fits, most typical first. */
  levels: CourseLevelValue[];
  kind: CatalogKind;
  /** The curriculum provider, only for official records. */
  provider?: string;
  /** A course code, only when the provider itself publishes one. */
  code?: string;
  /** A standardized curriculum identifier, only when verified. */
  curriculumId?: string;
  /** A few words that tell similar courses apart (e.g. "Calculus-based"). */
  descriptor?: string;
  /** Recommended preparation, only when the provider publishes it. */
  prerequisites?: { note: string; courseIds?: string[] };
  source: SourceId;
  /** When this record was last checked against its source (YYYY-MM-DD). */
  updatedAt: string;
}
