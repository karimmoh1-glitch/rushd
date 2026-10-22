import { describe, it, expect } from "vitest";
import { resolveCitations, stripMarkers } from "./citations";
import type { RetrievedSource } from "./tools";

const known: Record<string, RetrievedSource> = {
  abc: { id: "abc", title: "Unit 3 notes", kind: "PAGE", className: "Chem", url: "https://school.instructure.com/courses/1/pages/unit-3" },
  def: { id: "def", title: "Lab 4", kind: "ASSIGNMENT", className: "Chem", url: null },
};
const lookup = (id: string) => known[id];

describe("resolveCitations", () => {
  it("numbers real sources in order of first use and reuses numbers", () => {
    const { text, sources } = resolveCitations("Moles count particles [[source:abc]]. See the lab [[source:def]] and notes [[source:abc]].", lookup);
    expect(text).toBe("Moles count particles [1]. See the lab [2] and notes [1].");
    expect(sources.map((s) => [s.n, s.id, s.url])).toEqual([
      [1, "abc", known.abc.url],
      [2, "def", null],
    ]);
  });

  it("drops citations to anything the tutor didn't actually retrieve", () => {
    const { text, sources } = resolveCitations("Per the syllabus [[source:made_up]], late work loses 10%.", lookup);
    expect(text).toBe("Per the syllabus, late work loses 10%.");
    expect(sources).toEqual([]);
  });

  it("never turns model text into a link", () => {
    const { sources } = resolveCitations("Watch https://evil.example/video [[source:abc]]", lookup);
    expect(sources[0].url).toBe(known.abc.url);
    expect(sources).toHaveLength(1);
  });
});

describe("stripMarkers", () => {
  it("hides complete and half-streamed markers", () => {
    expect(stripMarkers("A [[source:abc]] B [[sour")).toBe("A  B ");
  });
});
