# Course catalog

The catalog behind the course picker (onboarding and Courses → Add course). It is typed data in the repo, so every change is versioned and reviewed like code.

Code: `src/lib/courses/catalog/` (records, levels, sources, search) and `src/components/course/course-picker.tsx` (the picker).

## What a record is

```ts
{
  id: "ap-calculus-ab",          // stored on Class.catalogId; never change or reuse
  title: "AP Calculus AB",
  aliases: ["Calc AB", ...],     // what students actually type
  subject: "Math",               // one of SUBJECTS in types.ts
  levels: ["AP"],                // most typical first
  kind: "official" | "template",
  provider?: "College Board",    // official records only
  code?, curriculumId?,          // only when the provider publishes them (none yet)
  descriptor?: "Limits, derivatives, integrals",  // tells similar courses apart
  prerequisites?: { note, courseIds? },           // only when the provider publishes them
  source: "college-board-ap",    // key into SOURCES (sources.ts)
  updatedAt: "2026-10-22",       // when it was last checked against its source
}
```

## Sources, and the rules that keep it honest

| Source | What we take from it | Kind |
| --- | --- | --- |
| College Board AP course list (`college-board-ap`) | Official AP course names (all 42 on the AP course index, incl. Career Kickstart), and recommended prerequisites, paraphrased from the course pages (checked 2026-10-23) | official |
| IB Diploma Programme subjects (`ib-dp-subjects`) | Subject names by group, at SL, HL, or both as offered; the core (TOK, EE). ibo.org blocked automated fetches on 2026-10-23, so this list still needs a manual check against the IB's subject pages | official |
| Rushd generic templates (`rushd-template`) | Common course names (middle school through graduate and professional) | template |

- **Templates carry nothing institution-specific**: no codes, no prerequisites, no syllabi, no provider. A test (`catalog.test.ts`) fails if one does. "Data Structures" or "Organic Chemistry I" is a name, not a curriculum: the student's school, code, term, and real work make it theirs, and the UI says so ("Generic template").
- **Unknown stays unknown.** A record without `prerequisites` means we don't know, not "none".
- **No invented codes or identifiers.** `code` and `curriculumId` exist for verified data (e.g. a provider's published code, or a state/NCES identifier checked against its source). None are filled in yet.
- Descriptors are short, general distinctions (e.g. "Calculus-based", "c. 1491 to the present"), never claims about a particular school.

## Levels

`levels.ts` lists them in order; values match the `CourseLevel` enum (`UNIVERSITY` = undergraduate, `OTHER` = fully custom). New enum values are only ever appended (additive migration). `relatedLevels()` says which levels a student at one level also takes (a high school student also takes honors, AP, IB, and dual-enrollment courses); search ranks those first, in that order.

Shared college templates list every level they fit (`["UNIVERSITY", "COMMUNITY_COLLEGE", "ASSOCIATE", "DUAL_ENROLLMENT"]`). When a student adds one, the course gets the level that matches the student (a high schooler's "Calculus I" is saved as dual enrollment).

## Search (`search.ts`)

Runs in the browser on every keystroke (about 1.5 ms per query over ~530 records on a laptop). Every typed word must match the title, an alias, the subject, the provider/code, or a level word (typed in full: "ap", "honors", "running start"). Matches are exact, prefix ("chem"), or typo-tolerant (one edit for 4–6 letters, two for longer; neighbor swaps count as one). Ranking: the student's own level, then related levels in order; within that, exact title/alias, prefix, and how much of the title the query covers. Typo-only matches never outrank clean ones. Results are grouped by level and labeled with the provider ("College Board") or "Generic templates". "Create … as a custom course" is offered whenever the query isn't exactly a course title or alias. Unit tests: `search.test.ts`.

## Popular and recent courses

- **Recent** = the student's own courses, newest first (`recentOwnCourses`). Catalog results they already have are marked "Already in your courses".
- **Popular** = catalog ids actually saved on `Class.catalogId`, counted per distinct student, excluding staff and test accounts (`popularCatalogCourses`). A course appears only once at least `POPULAR_MIN_STUDENTS` (5) real students chose it; below that the section is hidden. Nothing is seeded or estimated.

## Adding or changing courses

1. Pick the data file for the level (`data/ap.ts`, `data/ib.ts`, `data/secondary.ts`, `data/college.ts`) or add a new one and include it in `CATALOG` in `index.ts`.
2. Add a row: title, aliases students really type, a descriptor only if it distinguishes a near-duplicate. Official records need a provider and a source entry in `sources.ts` with its URL.
3. Set `updatedAt` (the group's `UPDATED` constant) to the date you checked the source.
4. Never rename an `id` that has shipped: students' courses point at it. To retitle, keep the id (the `records()` helper accepts an `idTitle`). To retire a record, remove it; popular courses skip ids that no longer exist, and the student's course keeps its name.
5. Run `npx vitest run src/lib/courses` (uniqueness, well-formedness, no codes in templates, ranking).

Institution-specific catalogs (a university's real course list with codes) can be added later as their own source with official records, once there is a legitimate, maintainable feed for them.
