import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNSUPPORTED_MEDIA"
  | "FILE_TOO_LARGE"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH"
  | "PROVIDER_QUOTA"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_BAD_RESPONSE"
  | "PROVIDER_REJECTED_INPUT"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA: 400,
  FILE_TOO_LARGE: 400,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_AUTH: 502,
  PROVIDER_QUOTA: 429,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_BAD_RESPONSE: 502,
  PROVIDER_REJECTED_INPUT: 422,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS_BY_CODE[code];
  }
}

export function validationError(error: z.ZodError): AppError {
  return new AppError(
    "VALIDATION_ERROR",
    "Request validation failed",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError("NOT_FOUND", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof z.ZodError) {
    appError = validationError(err);
  } else if (err instanceof multer.MulterError) {
    appError =
      err.code === "LIMIT_FILE_SIZE"
        ? new AppError("FILE_TOO_LARGE", "Image must be 8 MB or smaller")
        : new AppError("VALIDATION_ERROR", `Upload error: ${err.message}`);
  } else if (err?.type === "entity.parse.failed") {
    appError = new AppError("VALIDATION_ERROR", "Malformed JSON body");
  } else if (err?.type === "entity.too.large") {
    appError = new AppError("VALIDATION_ERROR", "Request body too large");
  } else {
    console.error("[api] unhandled error:", err instanceof Error ? err.message : String(err));
    appError = new AppError("INTERNAL_ERROR", "Unexpected server error");
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};
