import { describe, it, expect } from "vitest";
import { htmlToText, parseRubric, readStoredRubric, rubricTotal } from "./content";

describe("htmlToText", () => {
  it("keeps readable structure and drops markup", () => {
    const html = `<h2>Lab 4</h2><p>Measure the <b>molar</b> mass.</p><ul><li>Goggles</li><li>Scale &amp; beaker</li></ul><script>alert(1)</script><style>p{}</style>`;
    expect(htmlToText(html)).toBe("Lab 4\nMeasure the molar mass.\n\n- Goggles\n- Scale & beaker");
  });

  it("decodes numeric and named entities, ignores unknown ones", () => {
    expect(htmlToText("<p>&#8220;Hi&#8221; &nbsp;&mdash; caf&#xe9; &bogus;</p>")).toBe("“Hi” — café &bogus;");
  });

  it("returns empty text for empty input and truncates long bodies", () => {
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(`<p>${"a".repeat(50)}</p>`, 10)).toBe(`${"a".repeat(10)}…`);
  });
});

describe("parseRubric", () => {
  const raw = [
    {
      id: "_123",
      description: "Thesis",
      long_description: "<p>Clear, arguable claim</p>",
      points: 4,
      ratings: [
        { id: "r1", description: "Full marks", points: 4 },
        { id: "r2", description: "No thesis", points: 0 },
      ],
    },
    { id: 9, description: "Ignored", points: 2, ignore_for_scoring: true, ratings: [] },
    { description: "Missing id" },
  ];

  it("keeps valid scoring criteria and their ratings, as plain text", () => {
    const rubric = parseRubric(raw)!;
    expect(rubric).toHaveLength(1);
    expect(rubric[0]).toMatchObject({ id: "_123", description: "Thesis", longDescription: "Clear, arguable claim", points: 4 });
    expect(rubric[0].ratings.map((r) => r.points)).toEqual([4, 0]);
    expect(rubricTotal(rubric)).toBe(4);
  });

  it("returns null rather than inventing a rubric", () => {
    expect(parseRubric(undefined)).toBeNull();
    expect(parseRubric(null)).toBeNull();
    expect(parseRubric([])).toBeNull();
    expect(parseRubric("nope")).toBeNull();
    expect(parseRubric([{ description: "no id" }])).toBeNull();
  });

  it("round-trips through storage and rejects malformed stored values", () => {
    const rubric = parseRubric(raw)!;
    expect(readStoredRubric(JSON.parse(JSON.stringify(rubric)))).toEqual(rubric);
    expect(readStoredRubric([{ id: "x" }])).toBeNull();
    expect(readStoredRubric(null)).toBeNull();
  });
});
