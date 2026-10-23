import { describe, it, expect } from "vitest";
import { searchCatalog, levelLabel, CATALOG } from "./catalog";

describe("searchCatalog", () => {
  it("finds courses by any words in the title or subject, prefix matches first", () => {
    const titles = searchCatalog("chem").map((c) => c.title);
    expect(titles).toContain("AP Chemistry");
    expect(titles).toContain("General Chemistry I");
    expect(searchCatalog("calc bc")[0].title).toBe("AP Calculus BC");
    expect(searchCatalog("Chemistry")[0].title).toBe("Chemistry");
  });

  it("narrows to the chosen level; college levels share one list", () => {
    expect(searchCatalog("chem", "AP").map((c) => c.title)).toEqual(["AP Chemistry"]);
    expect(searchCatalog("calculus", "COMMUNITY_COLLEGE").every((c) => c.level === "UNIVERSITY")).toBe(true);
    expect(searchCatalog("biology", "OTHER").length).toBeGreaterThan(1);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchCatalog("   ")).toEqual([]);
    expect(searchCatalog("a", null, 3)).toHaveLength(3);
  });

  it("has no duplicate titles and no course codes", () => {
    const titles = CATALOG.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.some((t) => /\b[A-Z]{2,4}\s?\d{3}\b/.test(t))).toBe(false);
  });

  it("labels levels", () => {
    expect(levelLabel("COMMUNITY_COLLEGE")).toBe("Community college");
    expect(levelLabel(null)).toBeNull();
  });
});
