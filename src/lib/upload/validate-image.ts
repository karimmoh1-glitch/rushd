import "server-only";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_IMAGES_PER_REQUEST = 5;

export type ValidatedMediaType = "image/png" | "image/jpeg" | "image/webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

/** True if `bytes` contains `expected` starting at `offset`. */
function bytesMatch(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

/** Checks the file's real signature bytes, never the client's Content-Type or
 * file name (both are attacker controlled). Null if it's not a supported image. */
export function sniffImageType(bytes: Uint8Array): ValidatedMediaType | null {
  if (bytesMatch(bytes, 0, PNG_SIGNATURE)) return "image/png";
  if (bytesMatch(bytes, 0, JPEG_SIGNATURE)) return "image/jpeg";
  if (bytesMatch(bytes, 0, RIFF) && bytesMatch(bytes, 8, WEBP)) return "image/webp";
  return null;
}

export interface ValidatedImage {
  base64: string;
  mediaType: ValidatedMediaType;
}

export type ValidateImagesResult =
  | { ok: true; images: ValidatedImage[] }
  | { ok: false; error: string };

export async function validateImageFiles(files: File[]): Promise<ValidateImagesResult> {
  if (files.length === 0) {
    return { ok: false, error: "Choose at least one screenshot." };
  }
  if (files.length > MAX_IMAGES_PER_REQUEST) {
    return { ok: false, error: `Upload at most ${MAX_IMAGES_PER_REQUEST} images at a time.` };
  }

  const images: ValidatedImage[] = [];
  for (const file of files) {
    const fileName = file.name || "One of your files";
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: `${fileName} is over the 8MB limit.` };
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImageType(buffer);
    if (!mediaType) {
      return { ok: false, error: `${fileName} isn't a recognized PNG, JPEG, or WebP image.` };
    }
    images.push({ base64: Buffer.from(buffer).toString("base64"), mediaType });
  }

  return { ok: true, images };
}
