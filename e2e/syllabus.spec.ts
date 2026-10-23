import { test, expect, type Page } from "@playwright/test";

// Syllabus import through the real UI with AI off (as in production): paste a
// syllabus, check the preview (confidence, source lines, an uncertain row that
// starts excluded), fix that row, confirm, and see the work on the course page,
// in the topic map, and on Today. Re-importing flags duplicates; another
// student can't open the import screen.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}
const longDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const slashDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const inputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function syllabusText(): string {
  return [
    "BIO 110: Introduction to Biology",
    "Instructor: Dr. Sam Ortiz",
    "",
    "Learning Objectives",
    "• Explain how cells capture and use energy",
    "• Interpret data from a controlled experiment",
    "",
    "Schedule",
    "Week 1: Cell structure and membranes",
    "Week 2: Metabolism and enzymes",
    `Lab report 1 due ${longDate(daysFromNow(2))}`,
    `Problem set 1 due ${slashDate(daysFromNow(4))}`,
    "Quiz 1 — date TBA",
    `Midterm exam: ${longDate(daysFromNow(12))}`,
    "",
    "Grading",
    "Labs 30%",
    "Midterm exam 30%",
    "Problem sets 40%",
    "",
    "Late assignments lose 10% per day.",
  ].join("\n");
}

async function newStudent(page: Page, label: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-syllabus-${label}-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Syllabus Tester");
  // Onboarding: level, skip courses and work, finish on Today.
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function addCourse(page: Page, name: string): Promise<string> {
  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().replace(/\/$/, "");
}

async function pasteAndRead(page: Page, text: string) {
  await page.getByRole("radio", { name: "Paste text" }).click();
  await page.getByLabel("Syllabus text").fill(text);
  await page.getByRole("button", { name: "Read syllabus" }).click();
  await expect(page.getByRole("heading", { name: "Check what Rushd found" })).toBeVisible({ timeout: 20_000 });
}

test("paste a syllabus, fix an uncertain row, confirm, and see the work everywhere", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const page = await context.newPage();
  await newStudent(page, "a");
  const courseUrl = await addCourse(page, "Intro Biology");

  // Entry point: the course workspace.
  await expect(page.getByText("No syllabus yet.")).toBeVisible();
  await page.getByRole("link", { name: "Import syllabus" }).click();
  await expect(page.getByRole("heading", { name: "Import your syllabus" })).toBeVisible();
  // Nothing to read yet.
  await page.getByRole("button", { name: "Read syllabus" }).click();
  await expect(page.locator("#main-content").getByRole("alert")).toHaveText("Choose your syllabus file first.");

  await pasteAndRead(page, syllabusText());
  await expect(page.getByText("Read with Rushd's built-in rules (no AI)", { exact: false })).toBeVisible();
  await expect(page.getByText("From your syllabus", { exact: true })).toBeVisible();

  // A confident row: included, with its source line on demand.
  const lab = page.getByRole("group", { name: "Lab report 1" });
  await expect(lab.getByRole("checkbox", { name: "Include Lab report 1" })).toBeChecked();
  await expect(lab.getByText("High confidence")).toBeVisible();
  await expect(lab.getByLabel("Date")).toHaveValue(inputDate(daysFromNow(2)));
  await lab.getByRole("button", { name: "Show source" }).click();
  await expect(lab.getByText("Line 11 of your syllabus")).toBeVisible();

  // The midterm got its weight from the grading section.
  await expect(page.getByRole("group", { name: "Midterm exam" }).getByLabel("Weight (%)")).toHaveValue("30");
  // Grading categories and the late-work policy are not assessments.
  await expect(page.getByRole("group", { name: "Labs" })).toHaveCount(0);

  // The uncertain row: flagged, excluded, can't be included without a date.
  const quiz = page.getByRole("group", { name: "Quiz 1" });
  await expect(quiz.getByText(/to be announced/)).toBeVisible();
  const quizCheckbox = quiz.getByRole("checkbox");
  await expect(quizCheckbox).not.toBeChecked();
  await expect(quizCheckbox).toBeDisabled();
  await expect(quiz.getByText("Add a date to include it.")).toBeVisible();
  // The student fixes it: a date and a clearer title. It's now included.
  await quiz.getByLabel("Date").fill(inputDate(daysFromNow(6)));
  await quiz.getByLabel("Title").fill("Quiz 1: Cells");
  await expect(quiz.getByText("You set the date.")).toBeVisible();
  await expect(quiz.getByRole("checkbox")).toBeChecked();

  // Topics from the schedule, objectives, and course details that need a tick.
  await expect(page.getByRole("group", { name: "Cell structure and membranes" }).getByRole("checkbox")).toBeChecked();
  await expect(page.getByText("Explain how cells capture and use energy")).toBeVisible();
  const instructor = page.getByRole("group", { name: "Instructor" });
  await expect(instructor.getByRole("textbox", { name: "Instructor" })).toHaveValue("Dr. Sam Ortiz");
  await expect(instructor.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByText("Adding 4 assessments, 2 topics, 2 objectives.")).toBeVisible();

  // Nothing has been saved yet.
  await page.goto(courseUrl);
  await expect(page.getByText("No syllabus yet.").first()).toBeVisible();
  await expect(page.getByText("Lab report 1")).toHaveCount(0);
  // (The review state is gone after leaving; read it again and confirm this time.)
  await page.goto(`${courseUrl}/syllabus`);
  await pasteAndRead(page, syllabusText());
  const quizAgain = page.getByRole("group", { name: "Quiz 1" });
  await quizAgain.getByLabel("Date").fill(inputDate(daysFromNow(6)));
  await quizAgain.getByLabel("Title").fill("Quiz 1: Cells");
  await page.getByRole("button", { name: "Confirm and add" }).click();

  await expect(page.getByRole("heading", { name: "Syllabus imported" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Added 2 assignments, 2 exams, 2 topics from your syllabus.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See your updated plan" })).toHaveAttribute("href", "/plan");

  // The course page: the work, the saved syllabus, its objectives.
  await page.getByRole("link", { name: "Open the course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Intro Biology" })).toBeVisible();
  const main = page.locator("#main-content");
  await expect(main.getByText("Lab report 1").first()).toBeVisible();
  await expect(main.getByText("Quiz 1: Cells").first()).toBeVisible();
  await expect(main.getByRole("link", { name: "Syllabus", exact: true })).toBeVisible();
  await expect(main.getByText("Explain how cells capture and use energy")).toBeVisible();
  // The saved syllabus reads as the student's, not Canvas's.
  await main.getByRole("link", { name: "Syllabus", exact: true }).click();
  await expect(page.getByText("From your syllabus, imported by you", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grading breakdown" })).toBeVisible();

  // Topics went through the topic map's confirm step and are labeled as from the syllabus.
  await page.goto(`${courseUrl}/topics`);
  await expect(page.getByRole("heading", { name: "Cell structure and membranes", level: 3 })).toBeVisible();
  await expect(page.getByText("From your syllabus").first()).toBeVisible();

  // Today has the new work.
  await page.goto("/dashboard");
  await expect(page.locator("#main-content").getByText("Lab report 1").first()).toBeVisible();
  // The assignments list marks where it came from.
  await page.goto("/assignments");
  await expect(page.getByText("From syllabus").first()).toBeVisible();

  // Importing the same syllabus again: everything already in Rushd is skipped by default.
  await page.goto(`${courseUrl}/syllabus`);
  await pasteAndRead(page, syllabusText());
  const labAgain = page.getByRole("group", { name: "Lab report 1" });
  await expect(labAgain.getByText(/Already in Rushd: “Lab report 1”/)).toBeVisible();
  await expect(labAgain.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Cell structure and membranes" }).getByText("Already in your topic map.")).toBeVisible();

  // Another student can't open this course's import screen.
  const otherContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const other = await otherContext.newPage();
  await newStudent(other, "b");
  await other.goto(`${courseUrl}/syllabus`);
  await expect(other.getByRole("heading", { name: "Page not found." })).toBeVisible();
  await expect(other.getByText("Intro Biology")).toHaveCount(0);
  await otherContext.close();
  await context.close();
});

/** A one-page PDF with standard-font text lines (built here so no binary fixture is checked in). */
function makePdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = ["BT", "/F1 11 Tf", ...lines.map((line, i) => `1 0 0 1 72 ${740 - i * 14} Tm (${esc(line)}) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("upload a PDF syllabus; a disguised file is refused by its bytes", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const page = await context.newPage();
  await newStudent(page, "pdf");
  const courseUrl = await addCourse(page, "Organic Chemistry Seminar");
  await page.goto(`${courseUrl}/syllabus`);

  // A PNG renamed to .pdf is read by its bytes and refused.
  await page.locator("#syllabus-file").setInputFiles({ name: "syllabus.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
  await page.getByRole("button", { name: "Read syllabus" }).click();
  await expect(page.locator("#main-content").getByRole("alert")).toContainText("That's an image");

  const pdf = makePdf(["CHEM 340: Organic Chemistry Seminar", "Instructor: Dr. Lee", "Schedule", "Week 1: Alkenes", `Problem set 1 due ${longDate(daysFromNow(3))}`]);
  await page.locator("#syllabus-file").setInputFiles({ name: "chem-340.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Read syllabus" }).click();
  await expect(page.getByRole("heading", { name: "Check what Rushd found" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("chem-340", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Problem set 1" }).getByLabel("Date")).toHaveValue(inputDate(daysFromNow(3)));
  await expect(page.getByRole("group", { name: "Course code" }).getByRole("textbox", { name: "Course code" })).toHaveValue("CHEM 340");
  await context.close();
});
