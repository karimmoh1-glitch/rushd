import type { CourseLevelValue } from "../levels";
import type { CatalogRecord, Subject } from "../types";
import { records, type Row } from "./build";

// Generic middle and high school course templates: common course names only.
// Course content, codes, and sequences differ by state, district, and school,
// so none of that is recorded. Source: SOURCES["rushd-template"].

const UPDATED = "2026-10-22";

function template(prefix: string, levels: CourseLevelValue[], subject: Subject, rows: (Row | string)[]): CatalogRecord[] {
  return records({ prefix, subject, levels, kind: "template", source: "rushd-template", updatedAt: UPDATED }, rows);
}

const MS: CourseLevelValue[] = ["MIDDLE_SCHOOL"];
const HS: CourseLevelValue[] = ["HIGH_SCHOOL"];
const HON: CourseLevelValue[] = ["HONORS"];

export const MIDDLE_SCHOOL_COURSES: CatalogRecord[] = [
  ...template("ms", MS, "Math", [
    { title: "Math 6", aliases: ["6th Grade Math", "Grade 6 Math"] },
    { title: "Math 7", aliases: ["7th Grade Math", "Grade 7 Math"] },
    { title: "Math 8", aliases: ["8th Grade Math", "Grade 8 Math"] },
    { title: "Pre-Algebra", aliases: ["Prealgebra"] },
    { title: "Algebra 1 (Middle School)", aliases: ["Algebra I", "8th Grade Algebra"] },
    { title: "Accelerated Math 7", aliases: ["Advanced Math 7", "Math 7 Accelerated"] },
    { title: "Geometry (Middle School)", aliases: ["Geometry"] },
  ]),
  ...template("ms", MS, "Science", [
    { title: "Science 6", aliases: ["6th Grade Science"] },
    { title: "Science 7", aliases: ["7th Grade Science"] },
    { title: "Science 8", aliases: ["8th Grade Science"] },
    { title: "Life Science", aliases: ["Life Sci"] },
    { title: "Earth Science (Middle School)", aliases: ["Earth Science", "Earth and Space Science"] },
    { title: "Physical Science (Middle School)", aliases: ["Physical Science"] },
  ]),
  ...template("ms", MS, "English", [
    { title: "English Language Arts 6", aliases: ["ELA 6", "6th Grade ELA", "English 6"] },
    { title: "English Language Arts 7", aliases: ["ELA 7", "7th Grade ELA", "English 7"] },
    { title: "English Language Arts 8", aliases: ["ELA 8", "8th Grade ELA", "English 8"] },
    { title: "Reading", aliases: ["Reading Workshop"] },
    { title: "Writing", aliases: ["Writing Workshop"] },
  ]),
  ...template("ms", MS, "History and Social Studies", [
    { title: "Social Studies 6", aliases: ["6th Grade Social Studies"] },
    { title: "Social Studies 7", aliases: ["7th Grade Social Studies"] },
    { title: "Social Studies 8", aliases: ["8th Grade Social Studies"] },
    { title: "World Geography (Middle School)", aliases: ["Geography", "World Geography"] },
    { title: "US History (Middle School)", aliases: ["American History", "U.S. History"] },
    { title: "Civics (Middle School)", aliases: ["Civics"] },
    { title: "Ancient Civilizations", aliases: ["Ancient History"] },
  ]),
  ...template("ms", MS, "World Languages", ["Spanish (Middle School)", "French (Middle School)", "Chinese (Middle School)"]),
  ...template("ms", MS, "Arts", ["Art (Middle School)", "Band (Middle School)", "Choir (Middle School)", "Orchestra (Middle School)", "Music (Middle School)", "Drama (Middle School)"]),
  ...template("ms", MS, "Physical Education and Health", ["Physical Education (Middle School)", "Health (Middle School)"]),
  ...template("ms", MS, "Technology", [
    { title: "Computer Science (Middle School)", aliases: ["Coding", "Intro to Coding"] },
    { title: "STEM (Middle School)", aliases: ["STEM", "Engineering and Design"] },
    { title: "Technology (Middle School)", aliases: ["Computer Applications", "Keyboarding"] },
  ]),
];

export const HIGH_SCHOOL_COURSES: CatalogRecord[] = [
  ...template("hs", HS, "Math", [
    { title: "Algebra 1", aliases: ["Algebra I", "Alg 1"] },
    { title: "Geometry", aliases: ["Geo"] },
    { title: "Algebra 2", aliases: ["Algebra II", "Alg 2"] },
    { title: "Integrated Math 1", aliases: ["Integrated Math I", "Math 1"] },
    { title: "Integrated Math 2", aliases: ["Integrated Math II", "Math 2"] },
    { title: "Integrated Math 3", aliases: ["Integrated Math III", "Math 3"] },
    { title: "Trigonometry", aliases: ["Trig"] },
    { title: "Precalculus", aliases: ["Precalc", "Pre-Calculus", "Pre-Calc"] },
    { title: "Calculus", aliases: ["Calc", "High School Calculus"], descriptor: "Non-AP high school calculus" },
    { title: "Statistics", aliases: ["Stats", "Probability and Statistics"], descriptor: "Non-AP high school statistics" },
    { title: "Financial Literacy", aliases: ["Personal Finance", "Consumer Math"] },
  ]),
  ...template("hs", HS, "Science", [
    { title: "Biology", aliases: ["Bio"] },
    { title: "Chemistry", aliases: ["Chem"] },
    { title: "Physics", aliases: ["Phys"] },
    { title: "Earth Science", aliases: ["Earth and Space Science"] },
    { title: "Physical Science", aliases: ["Phys Sci"] },
    { title: "Environmental Science", aliases: ["Env Sci", "Enviro"] },
    { title: "Anatomy and Physiology", aliases: ["A&P", "Anatomy"] },
    { title: "Forensic Science", aliases: ["Forensics"] },
    { title: "Marine Biology", aliases: ["Marine Science"] },
    { title: "Astronomy" },
  ]),
  ...template("hs", HS, "English", [
    { title: "English 9", aliases: ["Freshman English", "English I"] },
    { title: "English 10", aliases: ["Sophomore English", "English II"] },
    { title: "English 11", aliases: ["Junior English", "American Literature", "English III"] },
    { title: "English 12", aliases: ["Senior English", "British Literature", "English IV"] },
    { title: "Creative Writing" },
    { title: "Journalism" },
    { title: "Speech and Debate", aliases: ["Debate", "Speech"] },
  ]),
  ...template("hs", HS, "History and Social Studies", [
    { title: "World History", aliases: ["Global History"] },
    { title: "US History", aliases: ["U.S. History", "American History"] },
    { title: "Government", aliases: ["Gov", "American Government", "Civics"] },
    { title: "Economics", aliases: ["Econ"] },
    { title: "Psychology", aliases: ["Psych"] },
    { title: "Sociology" },
    { title: "World Geography", aliases: ["Geography"] },
  ]),
  ...template("hs", HS, "World Languages", [
    { title: "Spanish 1", aliases: ["Spanish I"] },
    { title: "Spanish 2", aliases: ["Spanish II"] },
    { title: "Spanish 3", aliases: ["Spanish III"] },
    { title: "Spanish 4", aliases: ["Spanish IV"] },
    { title: "French 1", aliases: ["French I"] },
    { title: "French 2", aliases: ["French II"] },
    { title: "French 3", aliases: ["French III"] },
    { title: "German 1", aliases: ["German I"] },
    { title: "German 2", aliases: ["German II"] },
    { title: "Chinese 1", aliases: ["Mandarin 1", "Chinese I"] },
    { title: "Chinese 2", aliases: ["Mandarin 2", "Chinese II"] },
    { title: "Latin 1", aliases: ["Latin I"] },
    { title: "Latin 2", aliases: ["Latin II"] },
    { title: "Arabic 1", aliases: ["Arabic I"] },
    { title: "American Sign Language 1", aliases: ["ASL 1", "ASL I"] },
    { title: "American Sign Language 2", aliases: ["ASL 2", "ASL II"] },
  ]),
  ...template("hs", HS, "Computer Science", [
    { title: "Computer Science", aliases: ["CS", "Comp Sci"] },
    { title: "Intro to Programming", aliases: ["Programming", "Coding"] },
    { title: "Web Design", aliases: ["Web Development"] },
  ]),
  ...template("hs", HS, "Arts", ["Art 1", "Drawing and Painting", "Photography", "Ceramics", "Band", "Choir", "Orchestra", "Theater", "Music Appreciation", "Graphic Design"]),
  ...template("hs", HS, "Physical Education and Health", [{ title: "Physical Education", aliases: ["PE", "Gym"] }, "Health"]),
  ...template("hs", HS, "Business", ["Intro to Business", "Accounting (High School)", "Marketing (High School)"]),
];

export const HONORS_COURSES: CatalogRecord[] = [
  ...template("hon", HON, "Math", [
    { title: "Honors Algebra 1", aliases: ["Algebra 1 Honors", "Honors Algebra I"] },
    { title: "Honors Geometry", aliases: ["Geometry Honors"] },
    { title: "Honors Algebra 2", aliases: ["Algebra 2 Honors", "Honors Algebra II", "Algebra 2/Trig Honors"] },
    { title: "Honors Precalculus", aliases: ["Precalculus Honors", "Honors Precalc", "Pre-Calc Honors"] },
    { title: "Honors Integrated Math 2", aliases: ["Integrated Math 2 Honors"] },
    { title: "Honors Integrated Math 3", aliases: ["Integrated Math 3 Honors"] },
    { title: "Honors Statistics", aliases: ["Statistics Honors"] },
  ]),
  ...template("hon", HON, "Science", [
    { title: "Honors Biology", aliases: ["Biology Honors", "Honors Bio"] },
    { title: "Honors Chemistry", aliases: ["Chemistry Honors", "Honors Chem"] },
    { title: "Honors Physics", aliases: ["Physics Honors"] },
    { title: "Honors Anatomy and Physiology", aliases: ["Anatomy Honors", "Honors A&P"] },
    { title: "Honors Earth Science", aliases: ["Earth Science Honors"] },
    { title: "Honors Physical Science", aliases: ["Physical Science Honors"] },
  ]),
  ...template("hon", HON, "English", [
    { title: "Honors English 9", aliases: ["English 9 Honors"] },
    { title: "Honors English 10", aliases: ["English 10 Honors"] },
    { title: "Honors English 11", aliases: ["English 11 Honors"] },
    { title: "Honors English 12", aliases: ["English 12 Honors"] },
  ]),
  ...template("hon", HON, "History and Social Studies", [
    { title: "Honors World History", aliases: ["World History Honors"] },
    { title: "Honors US History", aliases: ["US History Honors", "Honors U.S. History"] },
    { title: "Honors Government", aliases: ["Government Honors"] },
    { title: "Honors Economics", aliases: ["Economics Honors"] },
    { title: "Honors Civics", aliases: ["Civics Honors"] },
  ]),
  ...template("hon", HON, "World Languages", [
    { title: "Honors Spanish 3", aliases: ["Spanish 3 Honors"] },
    { title: "Honors Spanish 4", aliases: ["Spanish 4 Honors"] },
    { title: "Honors French 3", aliases: ["French 3 Honors"] },
    { title: "Honors French 4", aliases: ["French 4 Honors"] },
    { title: "Honors Chinese 3", aliases: ["Chinese 3 Honors"] },
    { title: "Honors Latin 3", aliases: ["Latin 3 Honors"] },
  ]),
  ...template("hon", HON, "Computer Science", [{ title: "Honors Computer Science", aliases: ["Computer Science Honors"] }]),
];
