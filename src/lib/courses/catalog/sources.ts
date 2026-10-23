// Where catalog records come from. Every record names one of these, and
// docs/CATALOG.md explains how each is maintained.

export const SOURCES = {
  "college-board-ap": {
    name: "College Board AP course list",
    url: "https://apstudents.collegeboard.org/course-index-page",
    note: "Official AP course names and, where College Board publishes them, recommended prerequisites (paraphrased).",
  },
  "ib-dp-subjects": {
    name: "IB Diploma Programme subjects",
    url: "https://www.ibo.org/programmes/diploma-programme/curriculum/",
    note: "Official DP subject names by group, and whether each is offered at SL, HL, or both.",
  },
  "rushd-template": {
    name: "Rushd generic course templates",
    url: null,
    note: "Common course names written by Rushd. No institution, code, prerequisites, or syllabus: those vary by school.",
  },
} as const;

export type SourceId = keyof typeof SOURCES;
