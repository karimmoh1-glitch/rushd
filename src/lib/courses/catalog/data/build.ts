import type { CourseLevelValue } from "../levels";
import type { SourceId } from "../sources";
import type { CatalogRecord, CatalogKind, Subject } from "../types";

// Helpers that keep the data files short. A row is a title, optionally with
// aliases, a descriptor, and (official records only) recommended preparation.

export interface Row {
  title: string;
  aliases?: string[];
  descriptor?: string;
  prerequisites?: CatalogRecord["prerequisites"];
  /** Overrides the group's levels for this one row. */
  levels?: CourseLevelValue[];
}

export interface Group {
  /** Id prefix, e.g. "ap" gives "ap-calculus-ab". */
  prefix: string;
  subject: Subject;
  levels: CourseLevelValue[];
  kind: CatalogKind;
  source: SourceId;
  provider?: string;
  updatedAt: string;
}

export function slug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "ap" + "AP Calculus AB" gives "ap-calculus-ab", not "ap-ap-calculus-ab". */
function recordId(prefix: string, title: string): string {
  const base = slug(title);
  return base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`;
}

/** `idTitle` lets a record keep its id when its display title changes. */
export function records(group: Group, rows: (Row | string)[], idTitle?: (row: Row) => string): CatalogRecord[] {
  return rows.map((input) => {
    const row: Row = typeof input === "string" ? { title: input } : input;
    const record: CatalogRecord = {
      id: recordId(group.prefix, idTitle ? idTitle(row) : row.title),
      title: row.title,
      aliases: row.aliases ?? [],
      subject: group.subject,
      levels: row.levels ?? group.levels,
      kind: group.kind,
      source: group.source,
      updatedAt: group.updatedAt,
    };
    if (group.provider) record.provider = group.provider;
    if (row.descriptor) record.descriptor = row.descriptor;
    if (row.prerequisites) record.prerequisites = row.prerequisites;
    return record;
  });
}
