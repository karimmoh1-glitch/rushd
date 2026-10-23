import { toDateKey, zonedTimeToUtc } from "@/lib/time/zone";

// Reads assignments from a Canvas calendar feed (.ics), for students whose
// school turns off access tokens. Every Canvas user has a private feed URL
// under Calendar → Calendar Feed. Only assignment events are kept (UID
// "event-assignment-<id>"). Canvas titles look like "Problem set 4 [MATH 101]".

export interface FeedAssignment {
  uid: string;
  title: string;
  courseName: string | null;
  dueAt: Date;
  url: string | null;
}

/** One property line, e.g. "DTSTART;TZID=America/New_York:20261023T235900". */
interface Property {
  params: Record<string, string>;
  value: string;
}

const DUE_AT_END_OF_DAY = 23 * 60 + 59; // 11:59 PM, in minutes

/** Splits the feed into lines. A line starting with a space or tab continues the one before it. */
function unfoldLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const unfolded = normalized.replace(/\n[ \t]/g, "");
  return unfolded.split("\n");
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Parses "NAME;PARAM=x:value" into its name and Property. Returns null for a bad line. */
function parseLine(line: string): { name: string; property: Property } | null {
  const colon = line.indexOf(":");
  if (colon <= 0) {
    return null;
  }

  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const equals = part.indexOf("=");
    if (equals > 0) {
      const paramName = part.slice(0, equals).toUpperCase();
      const paramValue = part.slice(equals + 1).replace(/^"|"$/g, "");
      params[paramName] = paramValue;
    }
  }

  return { name: name.toUpperCase(), property: { params, value: line.slice(colon + 1) } };
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Reads DTSTART as a moment in time. A date with no time means "due that
 * day", so it becomes 11:59 PM in the student's time zone. */
function parseIcsDate(property: Property, fallbackZone: string): Date | null {
  const value = property.value.trim();

  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || property.params.VALUE === "DATE") {
    const dateMatch = dateOnly ?? value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) {
      return null;
    }
    const dateKey = toDateKey(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));
    return zonedTimeToUtc(dateKey, DUE_AT_END_OF_DAY, fallbackZone);
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTime) {
    return null;
  }
  const year = Number(dateTime[1]);
  const month = Number(dateTime[2]);
  const day = Number(dateTime[3]);
  const hour = Number(dateTime[4]);
  const minute = Number(dateTime[5]);
  const second = Number(dateTime[6] ?? 0);
  const isUtc = Boolean(dateTime[7]);

  if (isUtc) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  let zone = property.params.TZID ?? fallbackZone;
  if (!isValidTimeZone(zone)) {
    zone = fallbackZone;
  }
  return zonedTimeToUtc(toDateKey(year, month, day), hour * 60 + minute, zone);
}

/** Splits "Problem set 4 [MATH 101]" into a title and a course name. */
function splitTitle(summary: string): { title: string; courseName: string | null } {
  const match = summary.match(/^(.*\S)\s*\[([^\]]+)\]\s*$/);
  if (!match) {
    return { title: summary, courseName: null };
  }
  return { title: match[1].trim(), courseName: match[2].trim() };
}

/** Turns one event's properties into an assignment, or null if it isn't one. */
function eventToAssignment(event: Map<string, Property>, timeZone: string): FeedAssignment | null {
  const uid = event.get("UID")?.value.trim() ?? "";
  const summary = unescapeText(event.get("SUMMARY")?.value ?? "");
  const start = event.get("DTSTART");
  const dueAt = start ? parseIcsDate(start, timeZone) : null;

  if (!/^event-assignment-\w+$/.test(uid) || !summary || !dueAt) {
    return null;
  }

  const { title, courseName } = splitTitle(summary);
  return {
    uid,
    title: title.slice(0, 200),
    courseName: courseName?.slice(0, 120) ?? null,
    dueAt,
    url: event.get("URL")?.value.trim() ?? null,
  };
}

export function parseCanvasFeed(text: string, timeZone: string): FeedAssignment[] {
  const assignments: FeedAssignment[] = [];
  let currentEvent: Map<string, Property> | null = null;

  for (const line of unfoldLines(text)) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = new Map();
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent) {
        const assignment = eventToAssignment(currentEvent, timeZone);
        if (assignment) {
          assignments.push(assignment);
        }
      }
      currentEvent = null;
      continue;
    }

    if (currentEvent) {
      const parsed = parseLine(line);
      // Keep the first value when a property repeats.
      if (parsed && !currentEvent.has(parsed.name)) {
        currentEvent.set(parsed.name, parsed.property);
      }
    }
  }

  return assignments;
}

/** Canvas feed URLs look like https://<host>/feeds/calendars/user_<token>.ics */
export function parseFeedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return null;
  }
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]{10,100}\.ics$/.test(url.pathname)) {
    return null;
  }
  url.search = "";
  url.hash = "";
  return url;
}
