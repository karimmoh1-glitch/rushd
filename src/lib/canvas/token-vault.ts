import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Authenticated encryption for Canvas personal access tokens.
//
//  * AES-256-GCM: confidentiality + integrity. A modified ciphertext fails
//    authentication instead of decrypting to garbage.
//  * A fresh random 96-bit IV per encryption (never reused with a key).
//  * The owning userId is bound in as additional authenticated data, so a
//    ciphertext copied into another user's row cannot be decrypted there —
//    even by code that has the key. Cross-user token reuse fails closed.
//  * A version prefix ("v1") leaves room to rotate the algorithm or key
//    without a flag day.
//
// The key (CANVAS_TOKEN_ENCRYPTION_KEY, 32 random bytes, base64) lives only
// in the deployment environment — never in the repo, never in the database.
// It must stay stable across deploys: losing it makes stored tokens
// unrecoverable (students simply reconnect; nothing else is lost).
//
// Nothing here ever logs or interpolates a token or key into an error.

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class VaultError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "BAD_KEY" | "DECRYPT_FAILED" | "BAD_FORMAT",
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

/** Parses a base64 key and insists on exactly 32 bytes. */
export function parseKey(base64Key: string | undefined | null): Buffer {
  if (!base64Key) {
    throw new VaultError("NOT_CONFIGURED", "Canvas token encryption is not configured.");
  }
  const key = Buffer.from(base64Key.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new VaultError("BAD_KEY", "Canvas token encryption key must be 32 bytes (base64).");
  }
  return key;
}

function aad(userId: string): Buffer {
  return Buffer.from(`rushd:canvas-token:${userId}`, "utf8");
}

export function encryptWithKey(key: Buffer, userId: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptWithKey(key: Buffer, userId: string, payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new VaultError("BAD_FORMAT", "Stored credential is in an unrecognized format.");
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new VaultError("BAD_FORMAT", "Stored credential is in an unrecognized format.");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof VaultError) throw error;
    // Wrong key, wrong user, or tampered data — deliberately indistinguishable.
    throw new VaultError("DECRYPT_FAILED", "Stored credential could not be decrypted.");
  }
}

/** True only when a valid key is present in the environment. */
export function isVaultConfigured(): boolean {
  try {
    parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(userId: string, token: string): string {
  return encryptWithKey(parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY), userId, token);
}

export function decryptToken(userId: string, payload: string): string {
  return decryptWithKey(parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY), userId, payload);
}
