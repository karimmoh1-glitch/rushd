// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// docs/openapi.json must describe exactly the routes that exist: every
// route file's HTTP methods appear in the document, and the document names
// no route or method that isn't implemented.

const root = path.resolve(import.meta.dirname);
const spec = JSON.parse(readFileSync(path.resolve(root, "../../../../docs/openapi.json"), "utf8")) as {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
};
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

function implemented(): Map<string, string[]> {
  const routes = new Map<string, string[]>();
  for (const file of routeFiles(root)) {
    const apiPath = "/" + path.relative(root, path.dirname(file)).split(path.sep).join("/").replace(/\[(\w+)\]/g, "{$1}");
    const source = readFileSync(file, "utf8");
    const methods = METHODS.filter((method) => new RegExp(`export (async function|const) ${method}\\b`).test(source));
    routes.set(apiPath, methods.map((method) => method.toLowerCase()).sort());
  }
  return routes;
}

describe("docs/openapi.json", () => {
  it("is OpenAPI 3.1", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("documents exactly the implemented routes and methods", () => {
    const documented = new Map<string, string[]>();
    for (const [apiPath, item] of Object.entries(spec.paths)) {
      documented.set(apiPath, Object.keys(item).filter((key) => METHODS.includes(key.toUpperCase())).sort());
    }
    expect(Object.fromEntries(documented)).toEqual(Object.fromEntries(implemented()));
  });

  it("every route answers CORS preflights", () => {
    for (const file of routeFiles(root)) {
      expect(readFileSync(file, "utf8"), file).toMatch(/export const OPTIONS = preflight;/);
    }
  });
});
