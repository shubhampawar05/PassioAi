export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Downscales an image in the browser to at most `maxEdge` px (JPEG) before upload.
 * Passio recommends ~500 px for food photos (1024 keeps detail) and ~1200 px for
 * nutrition labels (callers pass 1600 at higher quality so small print stays legible).
 */
export async function downscaleImage(file: File, maxEdge = 1024, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}
