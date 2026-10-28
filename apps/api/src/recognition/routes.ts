import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError, validationError } from "../errors.js";
import type { FoodRecognitionProvider, RecognitionResult } from "./types.js";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

const jsonInputSchema = z.discriminatedUnion("inputType", [
  z.object({ inputType: z.literal("text"), text: z.string().trim().min(1).max(500) }),
  z.object({ inputType: z.literal("voice"), text: z.string().trim().min(1).max(500) }),
  z.object({ inputType: z.literal("barcode"), barcode: z.string().trim().regex(/^\d{6,14}$/, "Barcode must be 6–14 digits") }),
]);

/** Detects the real image type from magic bytes so a renamed file can't slip through. */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

type RecognitionResponse = RecognitionResult & { inputType: string; inputSummary: string };

export function recognitionRouter(provider: FoodRecognitionProvider): Router {
  const router = Router();

  router.post("/food-recognition", (req, res, next) => {
    if (req.is("multipart/form-data")) {
      upload.single("image")(req, res, (err: unknown) => {
        if (err) return next(err);
        handleImageUpload(req, provider).then((body) => res.json(body), next);
      });
      return;
    }
    handleJson(req, provider).then((body) => res.json(body), next);
  });

  return router;
}

/** Multipart uploads: `inputType` is `photo` (default) or `label` (Nutrition Facts panel). */
const uploadTypeSchema = z.enum(["photo", "label"]).default("photo");

async function handleImageUpload(req: Request, provider: FoodRecognitionProvider): Promise<RecognitionResponse> {
  const kind = uploadTypeSchema.safeParse(req.body?.inputType ?? undefined);
  if (!kind.success) throw validationError(kind.error);
  const file = req.file;
  if (!file) throw new AppError("VALIDATION_ERROR", "Attach an image in the `image` field");
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError("UNSUPPORTED_MEDIA", "Unsupported file type. Use a JPEG, PNG, WebP, or GIF image.");
  }
  const sniffed = sniffImageType(file.buffer);
  if (!sniffed) throw new AppError("UNSUPPORTED_MEDIA", "File content is not a supported image");
  const kb = Math.max(1, Math.round(file.size / 1024));
  const result =
    kind.data === "label"
      ? await provider.recognizeLabel(file.buffer, sniffed)
      : await provider.recognizeImage(file.buffer, sniffed);
  // The image buffer is not stored or logged; it is released with the request.
  const prefix = kind.data === "label" ? "label photo" : "photo";
  return { ...result, inputType: kind.data, inputSummary: `${prefix} (${sniffed}, ${kb} KB)` };
}

async function handleJson(req: Request, provider: FoodRecognitionProvider): Promise<RecognitionResponse> {
  const parsed = jsonInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  if (input.inputType === "barcode") {
    const result = await provider.lookupBarcode(input.barcode);
    return { ...result, inputType: "barcode", inputSummary: `barcode ${input.barcode}` };
  }
  const result = await provider.recognizeText(input.text);
  return { ...result, inputType: input.inputType, inputSummary: input.text.slice(0, 200) };
}
