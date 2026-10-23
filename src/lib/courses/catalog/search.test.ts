import { describe, it, expect } from "vitest";
import { browseCourses, editDistance, groupByLevel, scoreText, searchCourses, tokenize } from "./search";

const titles = (query: string, options?: Parameters<typeof searchCourses>[1]) => searchCourses(query, options).map((hit) => hit.record.title);
const top = (query: string, options?: Parameters<typeof searchCourses>[1]) => titles(query, options)[0];

describe("tokenize and editDistance", () => {
  it("normalizes case, accents, punctuation, '&', stop words, and roman numerals", () => {
    expect(tokenize("Calculus III")).toEqual(["calculus", "3"]);
    expect(tokenize("Español & Culture")).toEqual(["espanol", "culture"]);
    expect(tokenize("Intro to the History of Art")).toEqual(["intro", "history", "art"]);
  });

  it("counts a swap of neighbors as one edit and stops early", () => {
    expect(editDistance("chmeistry", "chemistry", 2)).toBe(1);
    expect(editDistance("organc", "organic", 1)).toBe(1);
    expect(editDistance("biology", "zoology", 1)).toBe(2);
  });
});

describe("searchCourses ranking", () => {
  it("exact titles and known abbreviations win", () => {
    expect(top("Chemistry")).toBe("Chemistry");
    expect(top("calc bc")).toBe("AP Calculus BC");
    expect(top("apush")).toBe("AP United States History");
    expect(top("orgo")).toBe("Organic Chemistry I");
    expect(top("ochem 2")).toBe("Organic Chemistry II");
    expect(top("data struct")).toBe("Data Structures");
    expect(top("discrete math")).toBe("Discrete Mathematics");
    expect(top("comp arch")).toBe("Computer Architecture");
    expect(top("ib bio hl")).toBe("IB Biology HL");
    expect(top("tok")).toBe("IB Theory of Knowledge");
  });

  it("tells similar courses apart: AP Calculus AB vs BC vs college Calculus I", () => {
    const ap = searchCourses("calculus", { prefer: "AP" }).slice(0, 2).map((hit) => hit.record.title);
    expect(ap.sort()).toEqual(["AP Calculus AB", "AP Calculus BC"]);
    expect(top("calculus", { prefer: "UNIVERSITY" })).toBe("Calculus I");
    expect(top("calc 1")).toBe("Calculus I");
    expect(top("college calculus")).toBe("Calculus I");
    // Each carries a label that distinguishes it.
    const hits = searchCourses("calculus", { prefer: "HIGH_SCHOOL", limit: 20 });
    const ab = hits.find((hit) => hit.record.id === "ap-calculus-ab")!;
    const calc1 = hits.find((hit) => hit.record.id === "col-calculus-i")!;
    expect(ab.level).toBe("AP");
    expect(ab.record.kind).toBe("official");
    expect(calc1.level).toBe("DUAL_ENROLLMENT");
    expect(calc1.record.kind).toBe("template");
  });

  it("tolerates typos", () => {
    expect(top("chemestry")).toBe("Chemistry");
    expect(titles("organic chemsitry")).toContain("Organic Chemistry I");
    expect(top("phisics", { level: "HIGH_SCHOOL" })).toBe("Physics");
    expect(top("microeconomcs", { prefer: "AP" })).toBe("AP Microeconomics");
  });

  it("matches prefixes as you type", () => {
    expect(titles("ap chem")).toEqual(["AP Chemistry"]);
    expect(titles("lin")).toContain("Linear Algebra");
    expect(titles("gen chem", { prefer: "COMMUNITY_COLLEGE" }).slice(0, 2)).toEqual(["General Chemistry I", "General Chemistry II"]);
  });

  it("searches subject, provider, and level words", () => {
    expect(titles("college board statistics")).toEqual(["AP Statistics"]);
    expect(titles("honors chemistry")[0]).toBe("Honors Chemistry");
    expect(searchCourses("running start english").every((hit) => hit.record.levels.includes("DUAL_ENROLLMENT"))).toBe(true);
    expect(top("graduate machine learning")).toBe("Machine Learning (Graduate)");
  });

  it("puts the student's own level first without hiding others", () => {
    const college = searchCourses("chemistry", { prefer: "UNIVERSITY", limit: 20 });
    expect(college[0].record.levels).toContain("UNIVERSITY");
    expect(college.slice(0, 6).map((hit) => hit.record.title)).toEqual(expect.arrayContaining(["General Chemistry I", "Organic Chemistry I"]));
    expect(college.map((hit) => hit.record.title)).toContain("AP Chemistry");
    const highSchool = searchCourses("chemistry", { prefer: "HIGH_SCHOOL" });
    expect(highSchool[0].record.title).toBe("Chemistry");
    // Related levels follow in order: a high school student sees AP before dual enrollment.
    const calc = titles("calc", { prefer: "HIGH_SCHOOL", limit: 20 });
    expect(calc[0]).toBe("Calculus");
    expect(calc.indexOf("AP Calculus AB")).toBeLessThan(calc.indexOf("Calculus I"));
  });

  it("a level filter keeps only that level", () => {
    expect(searchCourses("chem", { level: "AP" }).map((hit) => hit.record.title)).toEqual(["AP Chemistry"]);
    expect(searchCourses("biology", { level: "IB" }).every((hit) => hit.record.levels.includes("IB"))).toBe(true);
  });

  it("returns nothing for empty or unmatched queries and respects the limit", () => {
    expect(searchCourses("   ")).toEqual([]);
    expect(searchCourses("marine robotics lab")).toEqual([]);
    expect(searchCourses("b", { limit: 3 })).toHaveLength(3);
  });

  it("is fast enough to run on every keystroke", () => {
    searchCourses("warm");
    const start = performance.now();
    for (const query of ["c", "ch", "che", "chem", "chemi", "chemis", "chemist", "chemistr", "chemistry", "organic chemsitry 2"]) searchCourses(query);
    expect(performance.now() - start).toBeLessThan(150);
  });
});

describe("isExactMatch", () => {
  it("matches a title or an alias, ignoring case and punctuation", async () => {
    const { catalogRecord } = await import("./index");
    const { isExactMatch } = await import("./search");
    const ab = catalogRecord("ap-calculus-ab")!;
    expect(isExactMatch(ab, "ap calculus ab")).toBe(true);
    expect(isExactMatch(ab, "Calc AB")).toBe(true);
    expect(isExactMatch(ab, "calc")).toBe(false);
  });
});

describe("helpers", () => {
  it("groups hits by their level label in rank order", () => {
    const groups = groupByLevel(searchCourses("calculus", { prefer: "AP", limit: 6 }));
    expect(groups[0].level).toBe("AP");
    expect(groups.flatMap((group) => group.hits)).toHaveLength(6);
  });

  it("browses a spread of subjects at one level", () => {
    const ap = browseCourses("AP", 6);
    expect(ap).toHaveLength(6);
    expect(new Set(ap.map((record) => record.subject)).size).toBe(6);
    expect(browseCourses("DUAL_ENROLLMENT", 4)).toHaveLength(4);
  });

  it("scores a student's own course by name, code, or school", () => {
    expect(scoreText("lincoln", ["Chemistry", "CHEM 1A", "Lincoln High"])).toBeGreaterThan(0);
    expect(scoreText("chem 1a", ["Chemistry", "CHEM 1A", null])).toBeGreaterThan(0);
    expect(scoreText("biology", ["Chemistry", "CHEM 1A", "Lincoln High"])).toBe(0);
  });
});
