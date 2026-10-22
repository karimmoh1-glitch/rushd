// Browser-side image preparation for uploads: applies the photo's EXIF
// orientation, scales the long edge down, and re-encodes as JPEG so phone
// photos (often 5-12 MB) fit comfortably under the server's request limit.
// Also strips metadata such as GPS location, since only pixels are redrawn.

export const MAX_EDGE = 2000;
export const TARGET_BYTES = 1_500_000;

export class ImagePrepError extends Error {}

export async function compressImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  if (!file.type.startsWith("image/")) throw new ImagePrepError("That file isn't an image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImagePrepError("This image format isn't supported here. Use a JPG or PNG (on iPhone, Settings › Camera › Formats › Most Compatible).");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("Couldn't prepare the image in this browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && (blob.size <= TARGET_BYTES || quality === 0.65)) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  throw new ImagePrepError("Couldn't prepare the image in this browser.");
}
