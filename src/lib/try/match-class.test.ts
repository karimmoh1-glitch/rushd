import { describe, it, expect } from "vitest";
import { matchExistingClass } from "./match-class";

const courses = [
  { id: "chem", name: "AP Chemistry" },
  { id: "bio", name: "Biology Honors" },
  { id: "ush", name: "AP U.S. History" },
  { id: "wh", name: "World History" },
];

describe("matching a pasted class name to an existing course", () => {
  it("prefers an exact match, ignoring case", () => {
    expect(matchExistingClass("ap chemistry", courses)).toBe("chem");
  });
  it("uses the one course that contains the name as a word", () => {
    expect(matchExistingClass("Chemistry", courses)).toBe("chem");
    expect(matchExistingClass("Biology", courses)).toBe("bio");
  });
  it("doesn't guess when it's ambiguous or only a fragment", () => {
    expect(matchExistingClass("History", courses)).toBeNull();
    expect(matchExistingClass("Chem", courses)).toBeNull();
    expect(matchExistingClass("General", courses)).toBeNull();
    expect(matchExistingClass("", courses)).toBeNull();
  });
});
