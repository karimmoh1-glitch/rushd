import { toDateKey, zonedTimeToUtc } from "@/lib/time/zone";

// Reads assignments out of a Canvas calendar feed (.ics). This is the path for
// students whose school turns off personal access tokens: every Canvas user
// has a private feed URL under Calendar → Calendar Feed. Only assignment
// events are kept (UID "event-assignment-<id>"); class meetings and other
// calendar events are ignored. Canvas titles look like "Problem set 4 [MATH 101]".

export interface FeedAssignment {
  uid: string;
  title: string;
  courseName: string | null;
  dueAt: Date;
  url: string | null;
}

/** RFC 5545 line unfolding: a line starting with space/tab continues the previous one. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

interface Prop {
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): [string, Prop] | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return [name.toUpperCase(), { params, value: line.slice(colon + 1) }];
}

/** DTSTART as an instant. Date-only values mean "due that day": 11:59 PM in the student's zone. */
export function parseIcsDate(prop: Prop, fallbackZone: string): Date | null {
  const v = prop.value.trim();
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return zonedTimeToUtc(toDateKey(+m[1], +m[2], +m[3]), 23 * 60 + 59, fallbackZone);
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)));
  let zone = prop.params.TZID ?? fallbackZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = fallbackZone;
  }
  return zonedTimeToUtc(toDateKey(+y, +mo, +d), +h * 60 + +mi, zone);
}

function splitTitle(summary: string): { title: string; courseName: string | null } {
  const m = summary.match(/^(.*\S)\s*\[([^\]]+)\]\s*$/);
  return m ? { title: m[1].trim(), courseName: m[2].trim() } : { title: summary, courseName: null };
}

export function parseCanvasFeed(text: string, timeZone: string): FeedAssignment[] {
  const out: FeedAssignment[] = [];
  let current: Map<string, Prop> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = new Map();
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const uid = current.get("UID")?.value.trim() ?? "";
        const summary = unescapeText(current.get("SUMMARY")?.value ?? "");
        const start = current.get("DTSTART");
        const dueAt = start ? parseIcsDate(start, timeZone) : null;
        if (/^event-assignment-\w+$/.test(uid) && summary && dueAt) {
          const { title, courseName } = splitTitle(summary);
          const url = current.get("URL")?.value.trim() ?? null;
          out.push({ uid, title: title.slice(0, 200), courseName: courseName?.slice(0, 120) ?? null, dueAt, url });
        }
      }
      current = null;
      continue;
    }
    if (current) {
      const parsed = parseLine(line);
      if (parsed && !current.has(parsed[0])) current.set(parsed[0], parsed[1]);
    }
  }
  return out;
}

/** Canvas feed URLs: https://<host>/feeds/calendars/user_<token>.ics */
export function parseFeedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]{10,100}\.ics$/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return url;
}
