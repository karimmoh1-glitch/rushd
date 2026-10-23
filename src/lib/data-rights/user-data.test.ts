import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/db", () => ({ db: {} }));
const { USER_DATA, NOT_EXPORTED, ACCOUNT_FIELDS } = await import("./user-data");

// Reads prisma/schema.prisma and finds every model that belongs to a user:
// it has a userId / a relation to User, or a required relation to a model
// that does (e.g. TutorMessage → TutorConversation).
function userOwnedModels(): string[] {
  const schema = readFileSync(path.resolve(import.meta.dirname, "../../../prisma/schema.prisma"), "utf8");
  const models = new Map<string, string[]>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    models.set(match[1], match[2].split("\n").map((line) => line.replace(/\/\/.*$/, "").trim()).filter(Boolean));
  }
  const owned = new Set<string>();
  for (const [name, lines] of models) {
    if (name === "User") continue;
    if (lines.some((line) => /^(userId|referrerId|referredId)\s/.test(line) || /^\w+\s+User\??\s+@relation/.test(line))) owned.add(name);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, lines] of models) {
      if (name === "User" || owned.has(name)) continue;
      const parent = lines.find((line) => {
        const m = line.match(/^\w+\s+(\w+)\s+@relation\(fields:/);
        return m !== null && owned.has(m[1]);
      });
      if (parent) {
        owned.add(name);
        grew = true;
      }
    }
  }
  return [...owned].sort();
}

const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);

describe("user data registry (export + deletion coverage)", () => {
  const owned = userOwnedModels();

  it("finds the user-owned tables in the schema", () => {
    expect(owned).toContain("Assignment");
    expect(owned).toContain("TutorMessage");
    expect(owned.length).toBeGreaterThan(20);
  });

  it.each(owned)("%s is exported or explicitly excluded", (model) => {
    const exported = USER_DATA.some((source) => source.model === delegateName(model));
    const excluded = model in NOT_EXPORTED;
    // If this fails: add `{ key: "...", model: "${delegateName(model)}" }` to USER_DATA
    // in src/lib/data-rights/user-data.ts (or a reason to NOT_EXPORTED).
    expect(exported || excluded, `${model}: add it to USER_DATA in src/lib/data-rights/user-data.ts`).toBe(true);
  });

  it("never exports secrets", () => {
    expect(ACCOUNT_FIELDS).not.toHaveProperty("passwordHash");
    expect(ACCOUNT_FIELDS).not.toHaveProperty("sessionVersion");
    const omitted = (model: string) => USER_DATA.find((s) => s.model === model)?.omit ?? [];
    expect(omitted("canvasConnection")).toContain("encryptedToken");
    expect(omitted("teamsConnection")).toContain("encryptedRefreshToken");
    expect(omitted("calendarFeed")).toContain("encryptedUrl");
    expect(USER_DATA.some((s) => s.model === "passwordResetToken")).toBe(false);
  });

  it("uses unique section names", () => {
    const keys = USER_DATA.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
