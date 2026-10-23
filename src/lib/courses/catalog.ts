// Suggestions for the "add a course" search. Titles only: course codes and
// section numbers differ by school, so the student types those themselves.
// Any course not listed here can be added as a custom course.

export const COURSE_LEVELS = [
  { value: "MIDDLE_SCHOOL", label: "Middle school" },
  { value: "HIGH_SCHOOL", label: "High school" },
  { value: "AP", label: "AP" },
  { value: "IB", label: "IB" },
  { value: "DUAL_ENROLLMENT", label: "Dual enrollment" },
  { value: "COMMUNITY_COLLEGE", label: "Community college" },
  { value: "UNIVERSITY", label: "University" },
  { value: "OTHER", label: "Other" },
] as const;

export type CourseLevelValue = (typeof COURSE_LEVELS)[number]["value"];

export function levelLabel(level: CourseLevelValue | null | undefined): string | null {
  if (!level) return null;
  const found = COURSE_LEVELS.find((option) => option.value === level);
  return found ? found.label : null;
}

export interface CatalogCourse {
  title: string;
  subject: string;
  level: CourseLevelValue;
}

function list(level: CourseLevelValue, subject: string, titles: string[]): CatalogCourse[] {
  return titles.map((title) => ({ title, subject, level }));
}

export const CATALOG: CatalogCourse[] = [
  // AP (College Board course names)
  ...list("AP", "Math", ["AP Calculus AB", "AP Calculus BC", "AP Precalculus", "AP Statistics"]),
  ...list("AP", "Science", [
    "AP Biology",
    "AP Chemistry",
    "AP Environmental Science",
    "AP Physics 1: Algebra-Based",
    "AP Physics 2: Algebra-Based",
    "AP Physics C: Mechanics",
    "AP Physics C: Electricity and Magnetism",
  ]),
  ...list("AP", "Computer Science", ["AP Computer Science A", "AP Computer Science Principles"]),
  ...list("AP", "English", ["AP English Language and Composition", "AP English Literature and Composition"]),
  ...list("AP", "History and Social Studies", [
    "AP United States History",
    "AP World History: Modern",
    "AP European History",
    "AP African American Studies",
    "AP United States Government and Politics",
    "AP Comparative Government and Politics",
    "AP Human Geography",
    "AP Macroeconomics",
    "AP Microeconomics",
    "AP Psychology",
  ]),
  ...list("AP", "World Languages", [
    "AP Spanish Language and Culture",
    "AP Spanish Literature and Culture",
    "AP French Language and Culture",
    "AP German Language and Culture",
    "AP Italian Language and Culture",
    "AP Chinese Language and Culture",
    "AP Japanese Language and Culture",
    "AP Latin",
  ]),
  ...list("AP", "Arts", ["AP Art History", "AP Music Theory", "AP 2-D Art and Design", "AP 3-D Art and Design", "AP Drawing"]),
  ...list("AP", "Capstone", ["AP Seminar", "AP Research"]),

  // IB Diploma Programme subjects
  ...list("IB", "Math", ["IB Mathematics: Analysis and Approaches", "IB Mathematics: Applications and Interpretation"]),
  ...list("IB", "Science", ["IB Biology", "IB Chemistry", "IB Physics", "IB Environmental Systems and Societies", "IB Computer Science"]),
  ...list("IB", "English", ["IB English A: Language and Literature", "IB English A: Literature"]),
  ...list("IB", "History and Social Studies", ["IB History", "IB Economics", "IB Psychology", "IB Geography", "IB Business Management", "IB Global Politics", "IB Philosophy"]),
  ...list("IB", "World Languages", ["IB Spanish B", "IB French B"]),
  ...list("IB", "Arts", ["IB Visual Arts"]),
  ...list("IB", "Core", ["IB Theory of Knowledge"]),

  // High school
  ...list("HIGH_SCHOOL", "Math", ["Algebra 1", "Geometry", "Algebra 2", "Precalculus", "Calculus", "Statistics"]),
  ...list("HIGH_SCHOOL", "Science", ["Biology", "Chemistry", "Physics", "Earth Science", "Environmental Science", "Anatomy and Physiology"]),
  ...list("HIGH_SCHOOL", "English", ["English 9", "English 10", "English 11", "English 12"]),
  ...list("HIGH_SCHOOL", "History and Social Studies", ["World History", "US History", "Government", "Economics", "Psychology"]),
  ...list("HIGH_SCHOOL", "World Languages", ["Spanish 1", "Spanish 2", "Spanish 3", "French 1", "French 2", "French 3"]),
  ...list("HIGH_SCHOOL", "Computer Science", ["Computer Science"]),

  // Middle school
  ...list("MIDDLE_SCHOOL", "Math", ["Math 6", "Math 7", "Math 8", "Pre-Algebra"]),
  ...list("MIDDLE_SCHOOL", "Science", ["Science 6", "Science 7", "Science 8"]),
  ...list("MIDDLE_SCHOOL", "English", ["English Language Arts 6", "English Language Arts 7", "English Language Arts 8"]),
  ...list("MIDDLE_SCHOOL", "History and Social Studies", ["Social Studies 6", "Social Studies 7", "Social Studies 8"]),

  // College (community college and university intro courses)
  ...list("UNIVERSITY", "Math", ["Calculus I", "Calculus II", "Calculus III", "Linear Algebra", "Differential Equations", "Introduction to Statistics"]),
  ...list("UNIVERSITY", "Science", ["General Chemistry I", "General Chemistry II", "Organic Chemistry I", "General Biology I", "General Physics I", "General Physics II"]),
  ...list("UNIVERSITY", "Computer Science", ["Introduction to Computer Science", "Data Structures", "Discrete Mathematics"]),
  ...list("UNIVERSITY", "English", ["English Composition I", "English Composition II"]),
  ...list("UNIVERSITY", "History and Social Studies", [
    "Introduction to Psychology",
    "Principles of Microeconomics",
    "Principles of Macroeconomics",
    "Introduction to Sociology",
    "US History I",
  ]),
];

const COLLEGE_LEVELS: CourseLevelValue[] = ["COMMUNITY_COLLEGE", "UNIVERSITY", "DUAL_ENROLLMENT"];

/** Does a catalog course fit the level the student picked? College levels share one list. */
function fitsLevel(course: CatalogCourse, level: CourseLevelValue | null): boolean {
  if (!level || level === "OTHER") return true;
  if (COLLEGE_LEVELS.includes(level)) return course.level === "UNIVERSITY";
  return course.level === level;
}

/**
 * Courses matching what the student typed. Every word they type must appear
 * in the title or subject. Titles that start with the query come first.
 */
export function searchCatalog(query: string, level: CourseLevelValue | null = null, limit = 8): CatalogCourse[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const startsWith: CatalogCourse[] = [];
  const contains: CatalogCourse[] = [];
  const text = query.trim().toLowerCase();

  for (const course of CATALOG) {
    if (!fitsLevel(course, level)) continue;
    const haystack = `${course.title} ${course.subject}`.toLowerCase();
    const allWordsFound = words.every((word) => haystack.includes(word));
    if (!allWordsFound) continue;
    if (course.title.toLowerCase().startsWith(text)) startsWith.push(course);
    else contains.push(course);
  }
  return [...startsWith, ...contains].slice(0, limit);
}
