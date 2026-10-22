import type { RetrievedSource } from "./tools";

export interface CitedSource {
  n: number;
  id: string;
  title: string;
  kind: RetrievedSource["kind"];
  className: string;
  url: string | null;
}

const MARKER = /\[\[source:([A-Za-z0-9_-]{1,64})\]\]/g;

/**
 * Replaces the model's [[source:ID]] markers with numbered references, but
 * only for ids the tutor actually retrieved this turn (looked up in the
 * registry, i.e. real database rows). Unknown ids are dropped silently, so a
 * hallucinated citation can never turn into a link or a title.
 */
export function resolveCitations(
  text: string,
  lookup: (id: string) => RetrievedSource | undefined,
): { text: string; sources: CitedSource[] } {
  const sources: CitedSource[] = [];
  const numberFor = new Map<string, number>();
  const out = text.replace(MARKER, (_m, id: string) => {
    const source = lookup(id);
    if (!source) return "";
    let n = numberFor.get(id);
    if (n === undefined) {
      n = sources.length + 1;
      numberFor.set(id, n);
      sources.push({ n, id, title: source.title, kind: source.kind, className: source.className, url: source.url });
    }
    return `[${n}]`;
  });
  return { text: out.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim(), sources };
}

/** Hides citation markers while a reply is still streaming. */
export function stripMarkers(text: string): string {
  // A marker arrives a few characters at a time; hide any unfinished prefix.
  return text.replace(MARKER, "").replace(/\[\[?(?:s(?:o(?:u(?:r(?:c(?:e(?::[^\]]*)?)?)?)?)?)?)?$/, "");
}
