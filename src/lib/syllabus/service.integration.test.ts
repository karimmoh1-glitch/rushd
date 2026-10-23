import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import type { SyllabusAiResult } from "@/lib/ai/schemas";
import { localDateKey } from "@/lib/time/zone";
import { confirmSyllabusImport, previewSyllabus, SYLLABUS_MATERIAL_MARKER, type SyllabusPreview, type SyllabusProvider } from "./service";
import type { ConfirmSyllabusInput } from "./confirm-schema";
import { includedByDefault } from "./review";
import { searchMaterials } from "@/lib/course/retrieval";

// Real database, real services. AI is scripted: no live model is called.

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", `${name}.txt`), "utf8");
const NOW = new Date("2026-10-23T17:00:00Z");

describe("syllabus import (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function student(name = "AP Chemistry") {
    const user = await createTestUser();
    users.push(user.id);
    const cls = await db.class.create({ data: { userId: user.id, name, color: "#0f766e" } });
    return { userId: user.id, classId: cls.id };
  }

  async function owned(userId: string, classId: string) {
    const [assignments, exams, topics, materials, course] = await Promise.all([
      db.assignment.count({ where: { userId, classId } }),
      db.exam.count({ where: { userId, classId } }),
      db.courseTopic.count({ where: { userId, classId } }),
      db.courseMaterial.count({ where: { userId, classId } }),
      db.class.findUniqueOrThrow({ where: { id: classId }, select: { termStart: true, termEnd: true, code: true, teacher: true } }),
    ]);
    return { assignments, exams, topics, materials, course };
  }

  /** What the review screen sends when the student accepts the defaults. */
  function acceptDefaults(preview: SyllabusPreview, overrides: Partial<ConfirmSyllabusInput> = {}): ConfirmSyllabusInput {
    const kept = preview.draft.assessments.filter((a) => includedByDefault(a, Boolean(preview.duplicates[a.id])));
    return {
      classId: preview.classId,
      text: preview.text,
      sourceName: preview.sourceName,
      method: preview.draft.method,
      assessments: kept.map((a) => ({ title: a.title, type: a.type, date: a.date!, time: a.time, weight: a.weight, allowDuplicate: false, snippet: a.source.snippet })),
      topics: preview.draft.topics.filter((t) => !preview.existingTopics.includes(t.id)).map((t) => ({ title: t.title, parentTitle: t.parentTitle })),
      objectives: preview.draft.objectives.map((o) => o.text),
      grading: preview.draft.grading.map((g) => ({ label: g.label, weight: g.weight })),
      course: { termStart: null, termEnd: null, code: null, instructor: null },
      excluded: preview.draft.assessments.length - kept.length,
      ...overrides,
    };
  }

  it("previews without writing anything the student owns, and logs counts only", async () => {
    const { userId, classId } = await student();
    const before = await owned(userId, classId);
    const result = await previewSyllabus(userId, { classId, text: fixture("ap-chemistry") }, { aiAvailable: false, now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.draft.method).toBe("rules");
    expect(result.preview.draft.assessments.length).toBeGreaterThan(5);
    expect(await owned(userId, classId)).toEqual(before);

    const events = await db.event.findMany({ where: { userId, name: { startsWith: "syllabus_import" } }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.name)).toEqual(["syllabus_import_started", "syllabus_import_previewed"]);
    const previewed = events[1].properties as Record<string, unknown>;
    expect(previewed).toMatchObject({ method: "rules", source: "paste", assessments: { high: expect.any(Number), medium: expect.any(Number), low: expect.any(Number) } });
    // No titles, dates, or text in the event.
    expect(JSON.stringify(previewed)).not.toMatch(/Unit|Test|2026|Alvarez/);
  });

  it("refuses another student's course for preview and for confirm, and writes nothing", async () => {
    const owner = await student("Owner's course");
    const other = await student("Other course");
    const preview = await previewSyllabus(other.userId, { classId: owner.classId, text: fixture("ap-chemistry") }, { aiAvailable: false, now: NOW });
    expect(preview).toEqual({ ok: false, error: "Course not found." });

    const own = await previewSyllabus(owner.userId, { classId: owner.classId, text: fixture("ap-chemistry") }, { aiAvailable: false, now: NOW });
    if (!own.ok) throw new Error(own.error);
    const before = await owned(owner.userId, owner.classId);
    const attack = await confirmSyllabusImport(other.userId, acceptDefaults(own.preview, { course: { termStart: "2026-08-24", termEnd: null, code: "HACK 101", instructor: null } }), NOW);
    expect(attack).toEqual({ ok: false, error: "Course not found." });
    expect(await owned(owner.userId, owner.classId)).toEqual(before);
    expect(await db.assignment.count({ where: { userId: other.userId } })).toBe(0);
    expect(await db.courseMaterial.count({ where: { userId: other.userId } })).toBe(0);
  });

  it("confirms only the kept rows: work, topics through the learning core, the syllabus as a material", async () => {
    const { userId, classId } = await student();
    const result = await previewSyllabus(userId, { classId, text: fixture("ap-chemistry") }, { aiAvailable: false, now: NOW });
    if (!result.ok) throw new Error(result.error);
    const input = acceptDefaults(result.preview);
    // Defaults leave out the TBA unit test and the undated final.
    expect(input.assessments.map((a) => a.title)).not.toContain("Unit 4 Test");
    expect(input.excluded).toBe(2);

    const confirmed = await confirmSyllabusImport(userId, input, NOW);
    if (!confirmed.ok) throw new Error(confirmed.error);
    expect(confirmed.summary).toMatchObject({ assignments: 2, exams: 4, topics: 7, duplicatesSkipped: 0, courseUpdated: [] });

    const exams = await db.exam.findMany({ where: { userId, classId }, orderBy: { examAt: "asc" } });
    expect(exams.map((e) => e.title)).toEqual(["Unit 1 Test", "Unit 2 Test", "Unit 3 Quiz", "Midterm Exam"]);
    expect(exams.every((e) => e.importOrigin === "SYLLABUS")).toBe(true);
    // In the student's own zone (Los Angeles): 8:00 AM when the syllabus gives no time.
    expect(localDateKey(exams[0].examAt, "America/Los_Angeles")).toBe("2026-09-18");
    expect(exams[0].examAt.toISOString()).toBe("2026-09-18T15:00:00.000Z");
    expect(exams[3].notes).toMatch(/Worth 10% of your grade/);
    const lab = await db.assignment.findFirstOrThrow({ where: { userId, classId, title: "Lab 2 report" } });
    expect(lab).toMatchObject({ source: "MANUAL", importOrigin: "SYLLABUS", estimatedByRushd: true, estimatedMinutes: 90 });
    expect(lab.dueAt.toISOString()).toBe("2026-10-24T06:59:00.000Z"); // 11:59 PM Pacific

    const topics = await db.courseTopic.findMany({ where: { userId, classId }, orderBy: { position: "asc" } });
    expect(topics).toHaveLength(7);
    expect(topics.every((t) => t.source === "SYLLABUS" && t.status === "CONFIRMED")).toBe(true);

    const material = await db.courseMaterial.findFirstOrThrow({ where: { userId, classId, kind: "SYLLABUS" } });
    expect(material.canvasCourseId).toBe(SYLLABUS_MATERIAL_MARKER);
    expect(material.outline).toMatchObject({ objectives: expect.arrayContaining(["Design and carry out laboratory investigations safely"]) });
    // The tutor's course search finds it.
    const hits = await searchMaterials(userId, { query: "stoichiometry reactants", classId });
    expect(hits.map((h) => h.id)).toContain(material.id);

    // The course's term wasn't ticked, so it's unchanged.
    expect((await owned(userId, classId)).course).toMatchObject({ termStart: null, termEnd: null, code: null });

    const event = await db.event.findFirstOrThrow({ where: { userId, name: "syllabus_import_confirmed" } });
    expect(event.properties).toEqual({ method: "rules", assignments: 2, exams: 4, topics: 7, topicsSkipped: 0, duplicatesSkipped: 0, excluded: 2, objectives: 4, courseFields: 0 });
  });

  it("skips duplicates of existing work unless the student says to add them, and re-imports the material in place", async () => {
    const { userId, classId } = await student();
    await db.exam.create({ data: { userId, classId, title: "unit 1 test", examAt: new Date("2026-09-18T20:00:00Z") } });
    await db.courseTopic.create({ data: { userId, classId, title: "Kinetics", key: "kinetics" } });
    const result = await previewSyllabus(userId, { classId, text: fixture("ap-chemistry") }, { aiAvailable: false, now: NOW });
    if (!result.ok) throw new Error(result.error);
    const unit1 = result.preview.draft.assessments.find((a) => a.title === "Unit 1 Test")!;
    expect(result.preview.duplicates[unit1.id]).toMatchObject({ title: "unit 1 test", date: "2026-09-18", kind: "exam" });
    expect(result.preview.existingTopics).toHaveLength(1);

    // Even if the client sends the duplicate, the server skips it.
    const input = acceptDefaults(result.preview);
    input.assessments.push({ title: "Unit 1 Test", type: "exam", date: "2026-09-19", time: null, weight: null, allowDuplicate: false, snippet: null });
    const first = await confirmSyllabusImport(userId, input, NOW);
    if (!first.ok) throw new Error(first.error);
    expect(first.summary.duplicatesSkipped).toBe(1);
    expect(await db.exam.count({ where: { userId, classId, title: { equals: "Unit 1 Test", mode: "insensitive" } } })).toBe(1);

    // Importing the same syllabus again: everything is now a duplicate; the one marked "add anyway" (Lab 1) is created.
    const again = acceptDefaults(result.preview);
    again.assessments = again.assessments.map((a, i) => ({ ...a, allowDuplicate: i === 0 }));
    const second = await confirmSyllabusImport(userId, again, NOW);
    if (!second.ok) throw new Error(second.error);
    expect(second.summary).toMatchObject({ assignments: 1, exams: 0, duplicatesSkipped: again.assessments.length - 1, topics: 0, topicsSkipped: 6 });
    expect(await db.courseMaterial.count({ where: { userId, classId, kind: "SYLLABUS" } })).toBe(1);
  });

  it("updates the course's term, code and instructor only when ticked, and checks the term", async () => {
    const { userId, classId } = await student("Physics");
    const result = await previewSyllabus(userId, { classId, text: fixture("university-physics") }, { aiAvailable: false, now: NOW });
    if (!result.ok) throw new Error(result.error);
    const { termStart, termEnd } = result.preview.draft.course;
    expect([termStart?.value, termEnd?.value]).toEqual(["2027-01-11", "2027-04-30"]);
    const backwards = await confirmSyllabusImport(userId, acceptDefaults(result.preview, { course: { termStart: "2027-05-01", termEnd: "2027-01-11", code: null, instructor: null } }), NOW);
    expect(backwards).toEqual({ ok: false, error: "The term can't end before it starts." });
    expect((await owned(userId, classId)).assignments).toBe(0);

    const confirmed = await confirmSyllabusImport(userId, acceptDefaults(result.preview, { course: { termStart: "2027-01-11", termEnd: null, code: "PHYS 151", instructor: "Dr. Priya Raman" } }), NOW);
    if (!confirmed.ok) throw new Error(confirmed.error);
    expect(confirmed.summary.courseUpdated).toEqual(["term start", "course code", "instructor"]);
    const course = (await owned(userId, classId)).course;
    expect(course.termStart?.toISOString().slice(0, 10)).toBe("2027-01-11");
    expect(course.termEnd).toBeNull();
    expect(course).toMatchObject({ code: "PHYS 151", teacher: "Dr. Priya Raman" });
    // Subtopics keep their parent.
    const friction = await db.courseTopic.findFirstOrThrow({ where: { userId, classId, title: "Friction and tension" }, include: { parent: true } });
    expect(friction.parent?.title).toBe("Newton's laws of motion");
  });

  it("rejects payloads the review screen would never send", async () => {
    const { userId, classId } = await student();
    const base: ConfirmSyllabusInput = {
      classId,
      text: fixture("messy"),
      sourceName: null,
      method: "rules",
      assessments: [{ title: "Quiz 1", type: "quiz", date: "not-a-date", time: null, weight: null, allowDuplicate: false, snippet: null }],
      topics: [],
      objectives: [],
      grading: [],
      course: { termStart: null, termEnd: null, code: null, instructor: null },
      excluded: 0,
    };
    expect(await confirmSyllabusImport(userId, base, NOW)).toEqual({ ok: false, error: "Pick a date." });
    expect(await confirmSyllabusImport(userId, { ...base, text: "short" }, NOW)).toMatchObject({ ok: false });
    expect(await db.courseMaterial.count({ where: { userId } })).toBe(0);
  });

  describe("AI extraction (scripted provider)", () => {
    const text = fixture("messy");
    const scripted: SyllabusAiResult = {
      course: {
        title: { value: "Intro to Statistics", source: "Intro to Statistics   syllabus" },
        code: { value: "STAT 101", source: "STAT 101 Intro to Statistics" }, // not in the text: dropped
        instructor: { value: "mr. b. hale", source: "instructor - mr. b. hale" },
        term: null,
        termStart: null,
        termEnd: null,
      },
      assessments: [
        { title: "Project proposal", type: "project", date: "2026-10-03", time: null, dateText: "Oct 3", weight: null, confidence: "high", note: null, source: "Project proposal due Oct 3 (Friday)" },
        { title: "Midterm", type: "midterm", date: "2026-10-15", time: null, dateText: "10/14", weight: 20, confidence: "high", note: null, source: "Midterm: 10/14" },
        { title: "Homework 7", type: "assignment", date: "2026-11-02", time: null, dateText: "Nov 2", weight: null, confidence: "high", note: null, source: "HW 7 due Nov 2" },
      ],
      topics: [{ title: "Probability", parentTitle: null, week: 5, confidence: "high", source: "Week 5: Probability; quiz on Tuesday" }],
      objectives: [],
      grading: [{ label: "Homework", weight: 30, source: "Grading: homework 30% / quizzes 20% / midterm 20% / project 30%" }],
    };

    it("checks every AI item against the text and meters the call", async () => {
      const { userId, classId } = await student("Statistics");
      const calls: string[] = [];
      const provider: SyllabusProvider = {
        async extractSyllabus(input, onUsage) {
          calls.push(input.courseName);
          onUsage?.({ model: "claude-haiku-4-5-20251001", inputTokens: 1200, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 });
          return scripted;
        },
      };
      const result = await previewSyllabus(userId, { classId, text }, { aiAvailable: true, provider, now: NOW });
      if (!result.ok) throw new Error(result.error);
      const { draft } = result.preview;
      expect(calls).toEqual(["Statistics"]);
      expect(draft.method).toBe("ai");
      expect(draft.course.code).toBeNull();
      expect(draft.course.instructor?.value).toBe("mr. b. hale");

      const [proposal, midterm, hw7] = draft.assessments;
      expect(proposal.issues).toEqual(expect.arrayContaining(["No year in your syllabus — assumed 2026."]));
      expect(proposal.source.line).toBe(11);
      expect(midterm).toMatchObject({ dateConfidence: "low" });
      expect(midterm.issues[0]).toBe("The line says Oct 14, 2026, not Oct 15, 2026.");
      expect(hw7).toMatchObject({ confidence: "low", source: { line: null } });
      expect(hw7.issues).toContain("Rushd couldn't find this in your syllabus text — check it before adding.");
      expect(includedByDefault(hw7, false)).toBe(false);
      expect(draft.notes[0]).toMatch(/1 suggestion couldn't be matched/);

      const usage = await db.aiUsage.findFirstOrThrow({ where: { userId, feature: "syllabus_import" } });
      expect(usage).toMatchObject({ status: "completed", inputTokens: 1200, outputTokens: 600 });
    });

    it("falls back to the rules-based reader when the provider fails", async () => {
      const { userId, classId } = await student("Statistics");
      const provider: SyllabusProvider = { extractSyllabus: async () => null };
      const result = await previewSyllabus(userId, { classId, text }, { aiAvailable: true, provider, now: NOW });
      if (!result.ok) throw new Error(result.error);
      expect(result.preview.draft.method).toBe("rules");
      expect(result.preview.draft.notes[0]).toMatch(/built-in reader/);
      expect(await db.aiUsage.findFirstOrThrow({ where: { userId, feature: "syllabus_import" } })).toMatchObject({ status: "failed" });
    });
  });

  it("reads an uploaded text file by its bytes and refuses a disguised image", async () => {
    const { userId, classId } = await student();
    const file = { bytes: new TextEncoder().encode(fixture("ap-chemistry")), name: "chem-syllabus.pdf" };
    const result = await previewSyllabus(userId, { classId, file }, { aiAvailable: false, now: NOW });
    if (!result.ok) throw new Error(result.error);
    // Named .pdf, but it's text: read as text.
    expect(result.preview).toMatchObject({ source: "text", sourceName: "chem-syllabus" });
    const image = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), name: "syllabus.txt" };
    expect(await previewSyllabus(userId, { classId, file: image }, { aiAvailable: false, now: NOW })).toMatchObject({ ok: false, error: expect.stringMatching(/image/) });
  });
});
