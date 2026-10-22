import { describe, it, expect } from "vitest";
import { parseWeek, toWorkItems, TRY_MAX_ITEMS } from "./parse-week";
import { scoreAndRank } from "@/lib/planning/score";

// Monday, local time.
const now = new Date(2026, 0, 12, 15, 30);

describe("parseWeek", () => {
  it("reads class prefixes, days, effort, and exams", () => {
    const items = parseWeek("Chem: lab report Thursday 2h\n- calc quiz friday\n3. Gatsby essay draft", now);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ className: "Chem", title: "Lab report", kind: "assignment", minutes: 120, assumedDate: false });
    expect(new Date(items[0].dueAt).getDay()).toBe(4);
    expect(items[1]).toMatchObject({ className: "Calculus", kind: "exam", minutes: 120 });
    expect(items[2]).toMatchObject({ className: "English", assumedDate: true });
  });

  it("doesn't mistake a time for a class prefix and caps input", () => {
    const [item] = parseWeek("Study group 4:30 tomorrow", now);
    expect(item.className).toBe("General");
    const many = parseWeek(Array.from({ length: 40 }, (_, i) => `item ${i} friday`).join("\n"), now);
    expect(many).toHaveLength(TRY_MAX_ITEMS);
  });

  it("ranks with the real planner", () => {
    const items = parseWeek("English: research paper friday 3h\nbio quiz tomorrow\nspanish worksheet next week", now);
    const ranked = scoreAndRank(toWorkItems(items), now, null);
    expect(ranked[0].item.title.toLowerCase()).toContain("quiz");
    expect(ranked.map((r) => r.item.className)).toContain("Spanish");
  });
});
