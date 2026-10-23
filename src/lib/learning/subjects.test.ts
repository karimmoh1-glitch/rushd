import { describe, it, expect } from "vitest";
import { subjectFamily, subjectProfile } from "./subjects";

describe("subjectFamily", () => {
  it.each([
    [{ subject: "Math", name: "AP Calculus AB" }, "math"],
    [{ subject: null, name: "Discrete Mathematics" }, "math"],
    [{ subject: "Science", name: "AP Chemistry" }, "science"],
    [{ subject: null, name: "Organic Chemistry II" }, "science"],
    [{ subject: "English", name: "AP English Language and Composition" }, "humanities"],
    [{ subject: null, name: "AP United States History" }, "humanities"],
    [{ subject: "World Languages", name: "AP Spanish Language and Culture" }, "language"],
    [{ subject: null, name: "French 2" }, "language"],
    [{ subject: "Computer Science", name: "AP Computer Science A" }, "cs"],
    [{ subject: null, name: "Data Structures" }, "cs"],
    [{ subject: null, name: "AP Macroeconomics" }, "social_science"],
    [{ subject: null, name: "Intro Psychology" }, "social_science"],
    [{ subject: null, name: "Business Strategy" }, "general"],
    [{ subject: null, name: "Homeroom" }, "general"],
  ])("%o -> %s", (course, family) => {
    expect(subjectFamily(course)).toBe(family);
  });

  it("the general profile says it isn't specialized", () => {
    const p = subjectProfile({ name: "Business Strategy" });
    expect(p.specialized).toBe(false);
    expect(p.practiceNote).toMatch(/doesn't have a subject-specific/);
  });

  it("math uses worked problems", () => {
    expect(subjectProfile({ name: "Precalculus" }).format).toBe("worked_problem");
  });
});
