import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Next renders a page segment without re-running its layout on client-side
// navigation, so the admin layout's check alone doesn't protect page data.
// Every admin page (and any added later) must call requireAdmin() itself.

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("admin pages", () => {
  const found = pages(path.join(import.meta.dirname));

  it("are all found", () => {
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it.each(found.map((p) => [path.relative(import.meta.dirname, p), p]))("%s calls requireAdmin() before loading data", (_name, file) => {
    const source = readFileSync(file, "utf8");
    const body = source.slice(source.indexOf("export default async function"));
    const guard = body.indexOf("await requireAdmin()");
    expect(guard).toBeGreaterThan(-1);
    // The guard comes before the first database or data-loader call in the page body.
    const firstAwait = body.search(/await (?!requireAdmin)/);
    expect(firstAwait === -1 || guard < firstAwait).toBe(true);
  });
});
