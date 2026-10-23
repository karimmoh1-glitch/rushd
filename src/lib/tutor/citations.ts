import type { RetrievedSource } from "./tools";

export interface CitedSource {
  n: number;
  id: string;
  classId: string | null;
  title: string;
  kind: RetrievedSource["kind"];
  className: string;
  url: string | null;
}

const MARKER = /\[\[source:([A-Za-z0-9_-]{1,64})\]\]/g;

// The start of a marker cut off at the end of streaming text: "[", "[[", "[[sou", "[[source:ab", ...
const UNFINISHED_MARKER = /\[\[?(?:s(?:o(?:u(?:r(?:c(?:e(?::[^\]]*)?)?)?)?)?)?)?$/;

/** Replaces [[source:ID]] markers with numbered references, but only for ids the
 * tutor really retrieved this turn. Unknown ids are dropped, so a made-up
 * citation can never become a link. */
export function resolveCitations(
  text: string,
  lookup: (id: string) => RetrievedSource | undefined,
): { text: string; sources: CitedSource[] } {
  const sources: CitedSource[] = [];
  const numberFor = new Map<string, number>();
  const replaced = text.replace(MARKER, (_marker, id: string) => {
    const source = lookup(id);
    if (!source) return "";
    let n = numberFor.get(id);
    if (n === undefined) {
      n = sources.length + 1;
      numberFor.set(id, n);
      sources.push({ n, id, classId: source.classId ?? null, title: source.title, kind: source.kind, className: source.className, url: source.url });
    }
    return `[${n}]`;
  });

  // Tidy the spaces left behind where markers were removed.
  const noSpaceBeforePunctuation = replaced.replace(/[ \t]+([.,;:!?])/g, "$1");
  const singleSpaced = noSpaceBeforePunctuation.replace(/[ \t]{2,}/g, " ");
  return { text: singleSpaced.trim(), sources };
}

/** Hides citation markers, including a half-arrived one, while a reply is still streaming. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER, "").replace(UNFINISHED_MARKER, "");
}
