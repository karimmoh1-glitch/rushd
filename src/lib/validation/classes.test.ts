import { describe, it, expect } from "vitest";
import { ClassSchema } from "./classes";

const base = { name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM" as const };

function firstError(input: object): string | undefined {
  const result = ClassSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("ClassSchema", () => {
  it("accepts a course with only a name, like before", () => {
    expect(ClassSchema.safeParse(base).success).toBe(true);
  });

  it("accepts full course details and treats blanks as not given", () => {
    const parsed = ClassSchema.parse({
      ...base,
      level: "AP",
      code: " CHEM 101 ",
      institution: "",
      subject: "Science",
      termStart: "2026-08-25",
      termEnd: "2026-12-18",
      weeklyHours: 5,
    });
    expect(parsed).toMatchObject({ code: "CHEM 101", institution: undefined, termEnd: "2026-12-18", weeklyHours: 5 });
  });

  it("rejects bad details with clear messages", () => {
    expect(firstError({ ...base, termStart: "2026-12-18", termEnd: "2026-08-25" })).toBe("The term can't end before it starts.");
    expect(firstError({ ...base, termStart: "2026-02-30" })).toBe("Enter a real date.");
    expect(firstError({ ...base, termStart: "1999-01-01" })).toBe("Enter a real date.");
    expect(firstError({ ...base, code: "CHEM<script>" })).toBe("Course codes can use letters, numbers, spaces, and - . / & : #.");
    expect(firstError({ ...base, weeklyHours: 0 })).toBe("Weekly study time must be at least 1 hour.");
    expect(firstError({ ...base, weeklyHours: 2.5 })).toBe("Use whole hours.");
    expect(firstError({ ...base, level: "GRAD_SCHOOL" })).toBeDefined();
    expect(firstError({ ...base, institution: "x".repeat(121) })).toBe("School name is too long (max 120 characters).");
  });
});
