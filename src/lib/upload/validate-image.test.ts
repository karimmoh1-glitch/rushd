import { describe, it, expect } from "vitest";
import { sniffImageType, validateImageFiles, MAX_IMAGE_BYTES } from "./validate-image";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  // TS's DOM lib types BlobPart as ArrayBufferView<ArrayBuffer>, which a
  // plain Uint8Array doesn't structurally satisfy in this TS/lib version —
  // a type-checker nuance only, Uint8Array is a valid BlobPart at runtime.
  return new File([bytes as unknown as BlobPart], name, { type });
}

describe("sniffImageType", () => {
  it("recognizes real PNG signature bytes", () => {
    expect(sniffImageType(PNG_BYTES)).toBe("image/png");
  });

  it("recognizes real JPEG signature bytes", () => {
    expect(sniffImageType(JPEG_BYTES)).toBe("image/jpeg");
  });

  it("recognizes real WebP signature bytes", () => {
    expect(sniffImageType(WEBP_BYTES)).toBe("image/webp");
  });

  it("rejects bytes that don't match any known signature", () => {
    expect(sniffImageType(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBeNull();
  });

  it("does not trust a PNG-labeled file with the wrong bytes inside", () => {
    // The whole point: a renamed/relabeled file should not fool sniffing.
    const fakePng = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // actually "%PDF"
    expect(sniffImageType(fakePng)).toBeNull();
  });
});

describe("validateImageFiles", () => {
  it("rejects an empty selection", async () => {
    const result = await validateImageFiles([]);
    expect(result.ok).toBe(false);
  });

  it("rejects more than 5 files", async () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      makeFile(PNG_BYTES, `${i}.png`, "image/png"),
    );
    const result = await validateImageFiles(files);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size cap regardless of declared type", async () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(PNG_BYTES);
    const file = makeFile(oversized, "huge.png", "image/png");
    const result = await validateImageFiles([file]);
    expect(result.ok).toBe(false);
  });

  it("rejects a file whose bytes don't match its claimed type — never trust the extension", async () => {
    // A .png file that's actually plain text — the classic "renamed
    // malicious file" attack this check exists to catch.
    const notReallyPng = makeFile(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "totally-a-screenshot.png",
      "image/png",
    );
    const result = await validateImageFiles([notReallyPng]);
    expect(result.ok).toBe(false);
  });

  it("accepts a genuinely valid PNG and returns base64 + sniffed media type", async () => {
    const file = makeFile(PNG_BYTES, "screenshot.png", "image/png");
    const result = await validateImageFiles([file]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.images).toHaveLength(1);
      expect(result.images[0].mediaType).toBe("image/png");
      expect(result.images[0].base64.length).toBeGreaterThan(0);
    }
  });
});
