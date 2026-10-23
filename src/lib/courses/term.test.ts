import { describe, expect, it } from "vitest";
import { termProgress } from "./term";

describe("termProgress", () => {
  it("needs both dates", () => {
    expect(termProgress(undefined, "2026-12-18", "2026-10-22")).toBeNull();
    expect(termProgress("2026-08-25", undefined, "2026-10-22")).toBeNull();
  });

  it("reports the week of a running term", () => {
    expect(termProgress("2026-08-25", "2026-12-18", "2026-10-22")).toEqual({
      state: "running",
      percent: 51,
      week: 9,
      weeks: 17,
    });
  });

  it("counts the first and last day as inside the term", () => {
    expect(termProgress("2026-08-25", "2026-12-18", "2026-08-25")).toMatchObject({ state: "running", week: 1 });
    expect(termProgress("2026-08-25", "2026-12-18", "2026-12-18")).toMatchObject({ state: "running", percent: 100 });
  });

  it("knows when a term hasn't started or has ended", () => {
    expect(termProgress("2027-01-10", "2027-05-20", "2026-10-22")).toEqual({ state: "upcoming" });
    expect(termProgress("2026-01-10", "2026-05-20", "2026-10-22")).toEqual({ state: "ended" });
  });
});
