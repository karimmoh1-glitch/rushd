import { describe, it, expect } from "vitest";
import { parseCanvasFeed, parseFeedUrl } from "./ics";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  "BEGIN:VEVENT",
  "DTEND:20261023T035900Z",
  "DTSTART:20261023T035900Z",
  "SUMMARY:Problem set 4\\, part 2 [MATH 101 - Fall 2026]",
  "URL;VALUE=URI:https://canvas.example.edu/courses/12/assignments/456",
  "UID:event-assignment-456",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261024",
  "SUMMARY:Reading response with a very long title that the calendar folds onto",
  "  a second line [ENGL 200]",
  "UID:event-assignment-789",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Chicago:20261026T090000",
  "SUMMARY:Unit test [CHEM 110]",
  "UID:event-assignment-790",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261022T140000Z",
  "SUMMARY:Lecture [MATH 101 - Fall 2026]",
  "UID:event-calendar-event-55",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseCanvasFeed", () => {
  const items = parseCanvasFeed(FEED, "America/New_York");

  it("keeps only assignments, with their course and link", () => {
    expect(items.map((i) => i.uid)).toEqual(["event-assignment-456", "event-assignment-789", "event-assignment-790"]);
    expect(items[0]).toMatchObject({ title: "Problem set 4, part 2", courseName: "MATH 101 - Fall 2026", url: "https://canvas.example.edu/courses/12/assignments/456" });
    expect(items[0].dueAt.toISOString()).toBe("2026-10-23T03:59:00.000Z");
  });

  it("unfolds long lines and reads date-only and zoned times", () => {
    expect(items[1].title).toBe("Reading response with a very long title that the calendar folds onto a second line");
    expect(items[1].dueAt.toISOString()).toBe("2026-10-25T03:59:00.000Z"); // 11:59 PM New York
    expect(items[2].dueAt.toISOString()).toBe("2026-10-26T14:00:00.000Z"); // 9 AM Chicago
  });
});

describe("parseFeedUrl", () => {
  it("accepts Canvas feed links and refuses everything else", () => {
    expect(parseFeedUrl("webcal://canvas.example.edu/feeds/calendars/user_abcDEF1234567890.ics")?.toString()).toBe(
      "https://canvas.example.edu/feeds/calendars/user_abcDEF1234567890.ics",
    );
    expect(parseFeedUrl("http://canvas.example.edu/feeds/calendars/user_abcDEF1234567890.ics")).toBeNull();
    expect(parseFeedUrl("https://canvas.example.edu:8443/feeds/calendars/user_abcDEF1234567890.ics")).toBeNull();
    expect(parseFeedUrl("https://canvas.example.edu/feeds/calendars/user_abc/../../x.ics")).toBeNull();
    expect(parseFeedUrl("https://evil.example/anything.ics")).toBeNull();
  });
});
