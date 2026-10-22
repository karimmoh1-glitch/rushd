import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptWithKey, decryptWithKey, parseKey, VaultError } from "./token-vault";

const key = randomBytes(32);
const TOKEN = "7~AbCdEf0123456789SecretCanvasTokenValue";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof VaultError ? e.code : "OTHER";
  }
  return undefined;
}

describe("token vault", () => {
  it("round-trips a token for its owner", () => {
    const sealed = encryptWithKey(key, "user-1", TOKEN);
    expect(decryptWithKey(key, "user-1", sealed)).toBe(TOKEN);
  });

  it("never stores the plaintext, and does not leak it in the payload", () => {
    const sealed = encryptWithKey(key, "user-1", TOKEN);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain(Buffer.from(TOKEN).toString("base64"));
    expect(sealed.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh IV every time (same input, different ciphertext)", () => {
    const a = encryptWithKey(key, "user-1", TOKEN);
    const b = encryptWithKey(key, "user-1", TOKEN);
    expect(a).not.toBe(b);
    expect(decryptWithKey(key, "user-1", a)).toBe(decryptWithKey(key, "user-1", b));
  });

  it("refuses to decrypt a ciphertext moved to another user (cross-user binding)", () => {
    const sealed = encryptWithKey(key, "user-1", TOKEN);
    expect(codeOf(() => decryptWithKey(key, "user-2", sealed))).toBe("DECRYPT_FAILED");
  });

  it("refuses to decrypt with the wrong key", () => {
    const sealed = encryptWithKey(key, "user-1", TOKEN);
    expect(codeOf(() => decryptWithKey(randomBytes(32), "user-1", sealed))).toBe("DECRYPT_FAILED");
  });

  it("detects tampering with any segment", () => {
    const [v, iv, tag, ct] = encryptWithKey(key, "user-1", TOKEN).split(".");
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(codeOf(() => decryptWithKey(key, "user-1", [v, iv, tag, flip(ct)].join(".")))).toBe("DECRYPT_FAILED");
    expect(codeOf(() => decryptWithKey(key, "user-1", [v, iv, flip(tag), ct].join(".")))).toBe("DECRYPT_FAILED");
    expect(codeOf(() => decryptWithKey(key, "user-1", [v, flip(iv), tag, ct].join(".")))).toBe("DECRYPT_FAILED");
  });

  it("rejects malformed and unknown-version payloads", () => {
    expect(codeOf(() => decryptWithKey(key, "user-1", "not-a-payload"))).toBe("BAD_FORMAT");
    expect(codeOf(() => decryptWithKey(key, "user-1", "v2.a.b.c"))).toBe("BAD_FORMAT");
    expect(codeOf(() => decryptWithKey(key, "user-1", "v1.AAAA.BBBB.CCCC"))).toBe("BAD_FORMAT");
  });

  it("requires a real 32-byte key, and errors never contain the key or token", () => {
    expect(codeOf(() => parseKey(undefined))).toBe("NOT_CONFIGURED");
    expect(codeOf(() => parseKey(""))).toBe("NOT_CONFIGURED");
    expect(codeOf(() => parseKey(Buffer.from("short").toString("base64")))).toBe("BAD_KEY");
    expect(parseKey(key.toString("base64"))).toHaveLength(32);

    const sealed = encryptWithKey(key, "user-1", TOKEN);
    try {
      decryptWithKey(randomBytes(32), "user-1", sealed);
    } catch (e) {
      const text = String((e as Error).message) + String((e as Error).stack);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(key.toString("base64"));
    }
  });

  it("handles unicode and long tokens", () => {
    const long = "x".repeat(4096) + "é✓";
    expect(decryptWithKey(key, "u", encryptWithKey(key, "u", long))).toBe(long);
  });
});
