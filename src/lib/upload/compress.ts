// Browser-side image prep for uploads: applies EXIF orientation, shrinks the long
// edge, and re-encodes as JPEG so phone photos fit under the server's limit.
// Redrawing only the pixels also strips metadata such as GPS location.

const MAX_EDGE = 2000;
const TARGET_BYTES = 1_500_000;
// Try these JPEG qualities in order; the last one is used even if still large.
const QUALITIES = [0.85, 0.75, 0.65];

export class ImagePrepError extends Error {}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

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
  // White background, so transparent PNGs don't turn black as JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const jpegName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  for (let i = 0; i < QUALITIES.length; i++) {
    const blob = await toJpegBlob(canvas, QUALITIES[i]);
    const isLastTry = i === QUALITIES.length - 1;
    if (blob && (blob.size <= TARGET_BYTES || isLastTry)) {
      return new File([blob], jpegName, { type: "image/jpeg" });
    }
  }
  throw new ImagePrepError("Couldn't prepare the image in this browser.");
}
