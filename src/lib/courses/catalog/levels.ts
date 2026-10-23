// Course levels, in the order a student moves through them. The values match
// the CourseLevel enum in prisma/schema.prisma (UNIVERSITY = undergraduate,
// OTHER = fully custom); new values are only ever appended there.

export const COURSE_LEVELS = [
  { value: "MIDDLE_SCHOOL", label: "Middle school", hint: "Middle school or junior high", terms: ["middle", "junior high", "jr high", "ms"] },
  { value: "HIGH_SCHOOL", label: "High school", hint: "General high school courses", terms: ["high school", "hs", "secondary"] },
  { value: "HONORS", label: "Honors", hint: "Honors and advanced high school", terms: ["honors", "honours", "advanced", "accelerated", "gifted"] },
  { value: "AP", label: "AP", hint: "Advanced Placement, every subject", terms: ["ap", "advanced placement", "college board"] },
  { value: "IB", label: "IB", hint: "IB Diploma Programme, SL and HL", terms: ["ib", "international baccalaureate", "sl", "hl", "standard level", "higher level"] },
  { value: "DUAL_ENROLLMENT", label: "Dual enrollment", hint: "College courses in high school, incl. Running Start", terms: ["dual enrollment", "dual credit", "running start", "concurrent enrollment", "college in high school"] },
  { value: "COMMUNITY_COLLEGE", label: "Community college", hint: "Two-year college courses", terms: ["community college", "cc", "junior college", "college"] },
  { value: "ASSOCIATE", label: "Associate degree", hint: "Associate degree programs", terms: ["associate", "associates", "aa", "as", "aas", "college"] },
  { value: "UNIVERSITY", label: "Undergraduate", hint: "University and college, any discipline", terms: ["undergraduate", "undergrad", "university", "college", "bachelor"] },
  { value: "GRADUATE", label: "Graduate", hint: "Master's, PhD, and professional school", terms: ["graduate", "grad", "masters", "phd", "doctoral", "postgraduate", "grad school"] },
  { value: "PROFESSIONAL", label: "Professional", hint: "Professional and continuing education", terms: ["professional", "continuing education", "continuing ed", "certification", "certificate", "exam prep"] },
  { value: "OTHER", label: "Other", hint: "Anything else: fully custom courses", terms: ["other", "custom"] },
] as const;

export type CourseLevelValue = (typeof COURSE_LEVELS)[number]["value"];

export const LEVEL_VALUES = COURSE_LEVELS.map((option) => option.value) as [CourseLevelValue, ...CourseLevelValue[]];

export function levelLabel(level: CourseLevelValue | null | undefined): string | null {
  if (!level) return null;
  const found = COURSE_LEVELS.find((option) => option.value === level);
  return found ? found.label : null;
}

export function isCourseLevel(value: unknown): value is CourseLevelValue {
  return typeof value === "string" && (LEVEL_VALUES as readonly string[]).includes(value);
}

/**
 * The levels a student at `level` commonly takes, most relevant first. A high
 * school student also takes honors, AP, IB, and dual-enrollment courses; a
 * community college student takes the same intro courses as undergraduates.
 */
const RELATED: Record<CourseLevelValue, CourseLevelValue[]> = {
  MIDDLE_SCHOOL: ["MIDDLE_SCHOOL", "HIGH_SCHOOL"],
  HIGH_SCHOOL: ["HIGH_SCHOOL", "HONORS", "AP", "IB", "DUAL_ENROLLMENT"],
  HONORS: ["HONORS", "HIGH_SCHOOL", "AP", "IB", "DUAL_ENROLLMENT"],
  AP: ["AP", "HONORS", "HIGH_SCHOOL", "DUAL_ENROLLMENT"],
  IB: ["IB", "HIGH_SCHOOL", "HONORS"],
  DUAL_ENROLLMENT: ["DUAL_ENROLLMENT", "HIGH_SCHOOL", "HONORS", "AP"],
  COMMUNITY_COLLEGE: ["COMMUNITY_COLLEGE", "ASSOCIATE", "UNIVERSITY"],
  ASSOCIATE: ["ASSOCIATE", "COMMUNITY_COLLEGE", "UNIVERSITY"],
  UNIVERSITY: ["UNIVERSITY", "GRADUATE"],
  GRADUATE: ["GRADUATE", "UNIVERSITY", "PROFESSIONAL"],
  PROFESSIONAL: ["PROFESSIONAL", "GRADUATE", "UNIVERSITY"],
  OTHER: [],
};

export function relatedLevels(level: CourseLevelValue | null | undefined): CourseLevelValue[] {
  return level ? RELATED[level] : [];
}
