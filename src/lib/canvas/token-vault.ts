import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts saved access tokens with AES-256-GCM, so a changed ciphertext fails
// to decrypt instead of turning into garbage. Each encryption uses a fresh random IV.
// Security: the owner's userId is mixed in as "additional data", so a ciphertext
// copied into another user's row can never be decrypted there.
// The key (CANVAS_TOKEN_ENCRYPTION_KEY, 32 random bytes in base64) lives only in
// the deployment environment. If it's lost, students just reconnect.
// Never log or put a token or key into an error message.

const VERSION = "v1"; // lets us change the algorithm or key later
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

/** Reads a base64 key and insists on exactly 32 bytes. */
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

/** The extra data that ties a ciphertext to one user. */
function userBinding(userId: string): Buffer {
  return Buffer.from(`rushd:canvas-token:${userId}`, "utf8");
}

export function encryptWithKey(key: Buffer, userId: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(userBinding(userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Stored as "v1.<iv>.<tag>.<ciphertext>".
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
    decipher.setAAD(userBinding(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof VaultError) {
      throw error;
    }
    // Wrong key, wrong user, or tampered data all look the same on purpose.
    throw new VaultError("DECRYPT_FAILED", "Stored credential could not be decrypted.");
  }
}

/** True only when a valid key is set in the environment. */
export function isVaultConfigured(): boolean {
  try {
    parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(userId: string, token: string): string {
  const key = parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY);
  return encryptWithKey(key, userId, token);
}

export function decryptToken(userId: string, payload: string): string {
  const key = parseKey(process.env.CANVAS_TOKEN_ENCRYPTION_KEY);
  return decryptWithKey(key, userId, payload);
}
