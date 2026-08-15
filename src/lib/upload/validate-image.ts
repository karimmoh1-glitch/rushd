import "server-only";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_IMAGES_PER_REQUEST = 5;

export type ValidatedMediaType = "image/png" | "image/jpeg" | "image/webp";

/** Sniffs actual file signature bytes rather than trusting the client's
 * declared Content-Type or the filename extension — both are attacker
 * controlled. Returns null if the bytes don't match a supported format. */
export function sniffImageType(bytes: Uint8Array): ValidatedMediaType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }

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
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: `${file.name || "One of your files"} is over the 8MB limit.` };
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImageType(buffer);
    if (!mediaType) {
      return {
        ok: false,
        error: `${file.name || "One of your files"} isn't a recognized PNG, JPEG, or WebP image.`,
      };
    }
    images.push({ base64: Buffer.from(buffer).toString("base64"), mediaType });
  }

  return { ok: true, images };
}
