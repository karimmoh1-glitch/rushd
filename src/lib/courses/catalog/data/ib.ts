import type { CatalogRecord, Subject } from "../types";
import { records } from "./build";

// IB Diploma Programme subjects by group, each at the levels the IB offers it
// (SL, HL, or both). Source: SOURCES["ib-dp-subjects"]. The IB doesn't publish
// course prerequisites, so none are recorded.

const UPDATED = "2026-10-22";

interface IbSubject {
  name: string;
  aliases?: string[];
  descriptor?: string;
  /** Default: offered at both SL and HL. */
  only?: "SL";
}

function ib(subject: Subject, subjects: IbSubject[]): CatalogRecord[] {
  const out: CatalogRecord[] = [];
  for (const entry of subjects) {
    const levels: ("SL" | "HL")[] = entry.only ? [entry.only] : ["SL", "HL"];
    for (const level of levels) {
      const longLevel = level === "SL" ? "Standard Level" : "Higher Level";
      out.push(
        ...records(
          { prefix: "ib", subject, levels: ["IB"], kind: "official", source: "ib-dp-subjects", provider: "International Baccalaureate", updatedAt: UPDATED },
          [
            {
              title: `IB ${entry.name} ${level}`,
              aliases: [`IB ${entry.name} ${longLevel}`, ...(entry.aliases ?? []).map((alias) => `${alias} ${level}`)],
              descriptor: [entry.descriptor, longLevel].filter(Boolean).join(" · "),
            },
          ],
        ),
      );
    }
  }
  return out;
}

export const IB_COURSES: CatalogRecord[] = [
  // Group 1: Studies in language and literature
  ...ib("English", [
    { name: "English A: Literature", aliases: ["IB English Lit", "IB Lit"] },
    { name: "English A: Language and Literature", aliases: ["IB English Lang Lit", "IB Lang Lit"] },
    { name: "Literature and Performance", only: "SL" },
  ]),
  // Group 2: Language acquisition
  ...ib("World Languages", [
    { name: "Spanish B" },
    { name: "French B" },
    { name: "German B" },
    { name: "Mandarin B", aliases: ["IB Chinese B"] },
    { name: "Arabic B" },
    { name: "English B" },
    { name: "Spanish ab initio", only: "SL", descriptor: "Beginners" },
    { name: "French ab initio", only: "SL", descriptor: "Beginners" },
    { name: "Mandarin ab initio", only: "SL", descriptor: "Beginners" },
    { name: "Latin", descriptor: "Classical languages" },
  ]),
  // Group 3: Individuals and societies
  ...ib("History and Social Studies", [
    { name: "Business Management", aliases: ["IB Business", "IB BM"] },
    { name: "Digital Society" },
    { name: "Economics", aliases: ["IB Econ"] },
    { name: "Geography", aliases: ["IB Geo"] },
    { name: "Global Politics", aliases: ["IB GloPo"] },
    { name: "History", aliases: ["IB Hist"] },
    { name: "Philosophy" },
    { name: "Psychology", aliases: ["IB Psych"] },
    { name: "Social and Cultural Anthropology", aliases: ["IB Anthropology", "IB SCA"] },
    { name: "World Religions", only: "SL" },
  ]),
  // Group 4: Sciences (Environmental Systems and Societies also counts for group 3)
  ...ib("Science", [
    { name: "Biology", aliases: ["IB Bio"] },
    { name: "Chemistry", aliases: ["IB Chem"] },
    { name: "Physics", aliases: ["IB Phys"] },
    { name: "Design Technology", aliases: ["IB DT"] },
    { name: "Sports, Exercise and Health Science", aliases: ["IB SEHS"] },
    { name: "Environmental Systems and Societies", aliases: ["IB ESS"] },
  ]),
  ...ib("Computer Science", [{ name: "Computer Science", aliases: ["IB CS", "IB Comp Sci"] }]),
  // Group 5: Mathematics
  ...ib("Math", [
    { name: "Mathematics: Analysis and Approaches", aliases: ["IB Math AA", "IB AA"], descriptor: "Analytic, algebraic focus" },
    { name: "Mathematics: Applications and Interpretation", aliases: ["IB Math AI", "IB AI"], descriptor: "Modelling and statistics focus" },
  ]),
  // Group 6: The arts
  ...ib("Arts", [{ name: "Dance" }, { name: "Film" }, { name: "Music" }, { name: "Theatre", aliases: ["IB Theater"] }, { name: "Visual Arts", aliases: ["IB Art"] }]),
  // The core (not SL/HL)
  ...records({ prefix: "ib", subject: "Core", levels: ["IB"], kind: "official", source: "ib-dp-subjects", provider: "International Baccalaureate", updatedAt: UPDATED }, [
    { title: "IB Theory of Knowledge", aliases: ["TOK", "IB TOK"], descriptor: "DP core" },
    { title: "IB Extended Essay", aliases: ["EE", "IB EE"], descriptor: "DP core" },
  ]),
];
