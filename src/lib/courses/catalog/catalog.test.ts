import { describe, it, expect } from "vitest";
import { CATALOG, SOURCES, SUBJECTS, catalogRecord, isCatalogId, levelLabel, LEVEL_VALUES, COURSE_LEVELS } from "./index";

describe("catalog records", () => {
  it("have unique ids and titles", () => {
    const ids = CATALOG.map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
    const titles = CATALOG.map((record) => record.title.toLowerCase());
    const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
    expect(duplicates).toEqual([]);
  });

  it("are well-formed: known subject, levels, source, and a checked date", () => {
    for (const record of CATALOG) {
      expect(SUBJECTS, record.id).toContain(record.subject);
      expect(record.levels.length, record.id).toBeGreaterThan(0);
      for (const level of record.levels) expect(LEVEL_VALUES, record.id).toContain(level);
      expect(Object.keys(SOURCES), record.id).toContain(record.source);
      expect(record.updatedAt, record.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.id, record.id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
    }
  });

  it("templates carry no institution specifics: no provider, code, curriculum id, or prerequisites", () => {
    const templates = CATALOG.filter((record) => record.kind === "template");
    expect(templates.length).toBeGreaterThan(200);
    for (const record of templates) {
      expect(record.source, record.id).toBe("rushd-template");
      expect(record.provider, record.id).toBeUndefined();
      expect(record.code, record.id).toBeUndefined();
      expect(record.curriculumId, record.id).toBeUndefined();
      expect(record.prerequisites, record.id).toBeUndefined();
    }
  });

  it("official records name their provider and source", () => {
    for (const record of CATALOG.filter((r) => r.kind === "official")) {
      expect(record.provider, record.id).toBeTruthy();
      expect(record.source, record.id).not.toBe("rushd-template");
    }
  });

  it("no title looks like an institution course code (e.g. CHEM 101)", () => {
    expect(CATALOG.filter((record) => /\b[A-Z]{2,5}\s?\d{3}[A-Z]?\b/.test(record.title)).map((r) => r.title)).toEqual([]);
  });

  it("prerequisite links point at real records", () => {
    for (const record of CATALOG) {
      for (const id of record.prerequisites?.courseIds ?? []) expect(isCatalogId(id), `${record.id} -> ${id}`).toBe(true);
    }
  });

  it("covers every level except custom with dozens of real course names", () => {
    for (const level of LEVEL_VALUES) {
      if (level === "OTHER") continue;
      const count = CATALOG.filter((record) => record.levels.includes(level)).length;
      expect(count, level).toBeGreaterThanOrEqual(24);
    }
  });

  it("has the full College Board AP list and IB subjects at SL and HL", () => {
    const ap = CATALOG.filter((record) => record.levels.includes("AP"));
    expect(ap.length).toBeGreaterThanOrEqual(38);
    expect(catalogRecord("ap-calculus-ab")?.title).toBe("AP Calculus AB");
    expect(catalogRecord("ib-biology-hl")?.title).toBe("IB Biology HL");
    expect(catalogRecord("ib-biology-sl")?.title).toBe("IB Biology SL");
    // SL-only subjects have no HL record.
    expect(catalogRecord("ib-world-religions-sl")).toBeDefined();
    expect(catalogRecord("ib-world-religions-hl")).toBeUndefined();
  });

  it("labels every level", () => {
    expect(COURSE_LEVELS).toHaveLength(12);
    expect(levelLabel("COMMUNITY_COLLEGE")).toBe("Community college");
    expect(levelLabel("UNIVERSITY")).toBe("Undergraduate");
    expect(levelLabel(null)).toBeNull();
  });
});
