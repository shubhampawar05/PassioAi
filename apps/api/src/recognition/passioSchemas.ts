import { z } from "zod";

/**
 * Zod schemas for the subset of Passio REST responses this app reads.
 * Field names follow https://passio.gitbook.io/nutrition-ai (verified 2026-10-28).
 * Schemas are loose: undocumented extra fields are allowed, and optional fields
 * may be absent or null, because several doc examples differ from their schemas.
 */

const optNum = z.number().finite().nullish();
const optStr = z.string().nullish();

/** POST /v2/token-cache/unified/oauth/token/{key} */
export const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  customer_id: z.string().min(1),
  token_type: z.string().optional(),
});

const weightSchema = z.looseObject({ unit: optStr, value: optNum });

/** PassioMeasuredPortion / SearchItemNutritionPreview.portion */
export const portionSchema = z.looseObject({
  name: optStr,
  quantity: optNum,
  weight: weightSchema.nullish(),
  suggestedQuantity: z.array(z.number().finite()).nullish(),
});

export const nutritionPreviewSchema = z.looseObject({
  portion: portionSchema.nullish(),
  calories: optNum,
  carbs: optNum,
  fat: optNum,
  protein: optNum,
  fiber: optNum,
});

/** FC_IngredientExtractOutput (vision + text extraction routes) */
export const ingredientExtractItemSchema = z.looseObject({
  ingredientName: optStr,
  displayName: optStr,
  shortName: optStr,
  longName: optStr,
  portionSize: z.union([z.string(), z.number()]).nullish(),
  portionQuantity: optNum,
  weightGrams: optNum,
  mealName: optStr,
  refCode: optStr,
  type: optStr,
  score: optNum,
  nutritionPreview: nutritionPreviewSchema.nullish(),
});

export const ingredientExtractResponseSchema = z.array(ingredientExtractItemSchema);

/**
 * POST /napi/tools/extractMealLogAction. Live responses (2026-10-28) are an array of
 * `{action, mealTime, date, items[]}`; the doc example shows bare items, so both
 * element shapes are accepted.
 */
export const mealLogGroupSchema = z.looseObject({
  action: z.string().nullish(),
  mealTime: z.string().nullish(),
  date: z.string().nullish(),
  items: z.array(ingredientExtractItemSchema),
});

export const mealLogResponseSchema = z.array(z.union([mealLogGroupSchema, ingredientExtractItemSchema]));

/** PassioFood.nutrients[] entry */
export const nutrientEntrySchema = z.looseObject({
  amount: optNum,
  nutrient: z
    .looseObject({ name: optStr, unit: optStr, shortName: optStr })
    .nullish(),
});

export const passioFoodSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).nullish(),
  name: z.string().min(1),
  nutrients: z.array(nutrientEntrySchema).nullish(),
  portions: z.array(portionSchema).nullish(),
  ingredients: z
    .array(z.looseObject({ name: optStr, nutrients: z.array(nutrientEntrySchema).nullish() }))
    .nullish(),
  branded: z.looseObject({ owner: optStr, productCode: optStr }).nullish(),
  refCode: optStr,
});

/** ErrorResponse {code, cause} */
export const passioErrorSchema = z.looseObject({ code: z.number().optional(), cause: z.string().optional() });

export type IngredientExtractItem = z.infer<typeof ingredientExtractItemSchema>;
export type PassioFood = z.infer<typeof passioFoodSchema>;
export type PassioPortion = z.infer<typeof portionSchema>;
export type PassioNutrientEntry = z.infer<typeof nutrientEntrySchema>;
