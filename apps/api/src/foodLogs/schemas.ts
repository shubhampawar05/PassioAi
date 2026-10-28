import { z } from "zod";
import { isValidTimeZone, parseIsoDate } from "../lib/dayWindow.js";

const nutrientValue = z.number().finite().min(0).max(100_000).nullable();

/**
 * Body for saving a user-confirmed recognition result. Unknown keys (e.g. a
 * client-computed `calories` total) are stripped; totals are computed server-side.
 */
export const createEntrySchema = z.object({
  inputType: z.enum(["photo", "text", "barcode", "voice"]),
  inputSummary: z.string().trim().min(1).max(200),
  foodName: z.string().trim().min(1).max(200),
  servingUnit: z.string().trim().min(1).max(100),
  servingWeightG: z.number().finite().positive().max(100_000).nullable().default(null),
  quantity: z.number().finite().positive().max(100),
  perServing: z.object({
    calories: nutrientValue,
    proteinG: nutrientValue,
    carbohydratesG: nutrientValue,
    fatG: nutrientValue,
  }),
  provider: z.enum(["passio", "mock"]),
  providerRef: z.string().max(1000).nullable().default(null),
  providerDetails: z.record(z.string(), z.unknown()).optional(),
  loggedAt: z.iso.datetime({ offset: true }).optional(),
});

export const updateEntrySchema = z.object({
  quantity: z.number().finite().positive().max(100),
});

export const dayQuerySchema = z.object({
  date: z.string().refine((d) => parseIsoDate(d) !== null, "date must be a valid YYYY-MM-DD"),
  tz: z
    .string()
    .default("UTC")
    .refine((tz) => isValidTimeZone(tz), "tz must be a valid IANA timezone"),
});

export const idParamSchema = z.object({ id: z.uuid() });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
