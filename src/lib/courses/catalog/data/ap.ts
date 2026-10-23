import type { CatalogRecord, Subject } from "../types";
import { records, type Row } from "./build";

// Advanced Placement: College Board's own course list (all subjects).
// Prerequisite notes paraphrase College Board's published "recommended
// prerequisites" (checked against apstudents.collegeboard.org course pages
// on 2026-10-23) and appear only where checked; anything not noted here is
// unknown, not "none". Source: SOURCES["college-board-ap"].

const UPDATED = "2026-10-23";

function ap(subject: Subject, rows: Row[]): CatalogRecord[] {
  return records({ prefix: "ap", subject, levels: ["AP"], kind: "official", source: "college-board-ap", provider: "College Board", updatedAt: UPDATED }, rows);
}

const CALC_PREP = "College Board recommends completed coursework in algebra, geometry, trigonometry, analytic geometry, and elementary functions.";

export const AP_COURSES: CatalogRecord[] = [
  ...ap("Math", [
    { title: "AP Calculus AB", aliases: ["Calc AB", "AB Calc", "AP Calc AB"], descriptor: "Limits, derivatives, integrals", prerequisites: { note: CALC_PREP } },
    { title: "AP Calculus BC", aliases: ["Calc BC", "BC Calc", "AP Calc BC"], descriptor: "AB topics plus series, parametric and polar", prerequisites: { note: `${CALC_PREP.slice(0, -1)}, plus familiarity with sequences, series, and polar equations.` } },
    { title: "AP Precalculus", aliases: ["AP Precalc", "AP Pre-calc"], prerequisites: { note: "College Board recommends completed introductory algebra and geometry." } },
    { title: "AP Statistics", aliases: ["AP Stats", "AP Stat"], prerequisites: { note: "College Board recommends a first-year algebra course." } },
  ]),
  ...ap("Computer Science", [
    { title: "AP Computer Science A", aliases: ["AP CSA", "APCSA", "AP Comp Sci A", "AP Java"], descriptor: "Programming in Java", prerequisites: { note: "College Board recommends high school courses in English and algebra." } },
    { title: "AP Computer Science Principles", aliases: ["AP CSP", "APCSP", "AP Comp Sci Principles"], descriptor: "Broad intro to computing" },
  ]),
  ...ap("Science", [
    { title: "AP Biology", aliases: ["AP Bio", "APBio"], prerequisites: { note: "College Board recommends high school biology and chemistry first." } },
    { title: "AP Chemistry", aliases: ["AP Chem", "APChem"], prerequisites: { note: "College Board recommends high school chemistry and Algebra 2 first." } },
    { title: "AP Environmental Science", aliases: ["APES", "AP Enviro", "AP Env Sci"], prerequisites: { note: "College Board recommends two years of high school lab science (life and physical science) and at least one year of algebra." } },
    { title: "AP Physics 1: Algebra-Based", aliases: ["AP Physics 1", "AP Phys 1"], descriptor: "Algebra-based mechanics", prerequisites: { note: "College Board recommends completing Geometry and taking Algebra 2 at the same time or before." } },
    { title: "AP Physics 2: Algebra-Based", aliases: ["AP Physics 2", "AP Phys 2"], descriptor: "Algebra-based fluids, E&M, optics, modern", prerequisites: { note: "College Board recommends AP Physics 1 or a comparable course, and precalculus completed or in progress.", courseIds: ["ap-physics-1-algebra-based"] } },
    { title: "AP Physics C: Mechanics", aliases: ["AP Physics C Mech", "AP Phys C Mechanics", "Physics C Mechanics"], descriptor: "Calculus-based mechanics", prerequisites: { note: "College Board recommends calculus, completed or taken at the same time." } },
    { title: "AP Physics C: Electricity and Magnetism", aliases: ["AP Physics C E&M", "AP Physics C EM", "Physics C E and M", "AP E&M"], descriptor: "Calculus-based electricity and magnetism" },
  ]),
  ...ap("English", [
    { title: "AP English Language and Composition", aliases: ["AP Lang", "AP English Lang", "APLAC"], descriptor: "Rhetoric and argument" },
    { title: "AP English Literature and Composition", aliases: ["AP Lit", "AP English Lit", "APLit"], descriptor: "Literary analysis" },
  ]),
  ...ap("History and Social Studies", [
    { title: "AP United States History", aliases: ["APUSH", "AP US History", "AP U.S. History"], descriptor: "c. 1491 to the present" },
    { title: "AP World History: Modern", aliases: ["AP World", "APWH", "AP World History"], descriptor: "c. 1200 to the present" },
    { title: "AP European History", aliases: ["AP Euro", "APEH"], descriptor: "c. 1450 to the present" },
    { title: "AP African American Studies", aliases: ["AP AAS"] },
    { title: "AP United States Government and Politics", aliases: ["AP Gov", "AP US Gov", "AP Government", "AP U.S. Government"] },
    { title: "AP Comparative Government and Politics", aliases: ["AP Comp Gov", "AP Comparative Gov"] },
    { title: "AP Human Geography", aliases: ["APHG", "AP HuG", "AP Human Geo"] },
    { title: "AP Macroeconomics", aliases: ["AP Macro", "AP Macro Econ"], descriptor: "The economy as a whole" },
    { title: "AP Microeconomics", aliases: ["AP Micro", "AP Micro Econ"], descriptor: "Markets, firms, consumers" },
    { title: "AP Psychology", aliases: ["AP Psych"] },
  ]),
  ...ap("World Languages", [
    { title: "AP Spanish Language and Culture", aliases: ["AP Spanish", "AP Spanish Lang"] },
    { title: "AP Spanish Literature and Culture", aliases: ["AP Spanish Lit"] },
    { title: "AP French Language and Culture", aliases: ["AP French"] },
    { title: "AP German Language and Culture", aliases: ["AP German"] },
    { title: "AP Italian Language and Culture", aliases: ["AP Italian"] },
    { title: "AP Chinese Language and Culture", aliases: ["AP Chinese", "AP Mandarin"] },
    { title: "AP Japanese Language and Culture", aliases: ["AP Japanese"] },
    { title: "AP Latin", aliases: ["AP Latin Vergil"] },
  ]),
  ...ap("Arts", [
    { title: "AP Art History", aliases: ["AP Art Hist"] },
    { title: "AP Music Theory", aliases: ["AP Music"] },
    { title: "AP 2-D Art and Design", aliases: ["AP 2D Art", "AP 2D Design"] },
    { title: "AP 3-D Art and Design", aliases: ["AP 3D Art", "AP 3D Design"] },
    { title: "AP Drawing", aliases: ["AP Studio Art Drawing"] },
  ]),
  // AP Career Kickstart
  ...ap("Business", [{ title: "AP Business with Personal Finance", aliases: ["AP Business", "AP Personal Finance"] }]),
  ...ap("Technology", [{ title: "AP Cybersecurity", aliases: ["AP Cyber"] }]),
  ...ap("Capstone", [
    { title: "AP Seminar", aliases: ["AP Capstone Seminar"] },
    { title: "AP Research", aliases: ["AP Capstone Research"], prerequisites: { note: "College Board requires AP Seminar first.", courseIds: ["ap-seminar"] } },
  ]),
];
