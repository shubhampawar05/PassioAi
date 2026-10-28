import { z } from "zod";
import { AppError } from "../errors.js";
import { round } from "../lib/nutrition.js";
import { normalizeExtractItem } from "../recognition/normalize.js";
import { ingredientExtractItemSchema } from "../recognition/passioSchemas.js";

/**
 * Passio meal-plan payloads, matching LIVE responses (2026-10-28), which differ
 * from the docs. Each day is an object keyed by meal slot
 * (`{breakfast: {recipes: [...]}, ..., macros?: {...}}`); the full plan adds
 * recipe ingredients/preparation/macros and a top-level `shoppingList`.
 */

const optNum = z.number().finite().nullish();

export const macrosSchema = z.looseObject({ calories: optNum, protein: optNum, carbs: optNum, fat: optNum, fiber: optNum });

export const recipeSchema = z.looseObject({
  name: z.string().min(1),
  rejected: z.boolean().optional(),
  ingredients: z.array(ingredientExtractItemSchema).optional(),
  preparation: z.string().optional(),
  macros: macrosSchema.optional(),
});

const slotSchema = z.looseObject({ recipes: z.array(recipeSchema) });
const shoppingItemSchema = z.looseObject({
  name: z.string().min(1),
  portionQuantity: optNum,
  portionSize: z.string().nullish(),
});

const payloadSchema = z.looseObject({
  constraints: z.unknown().optional(),
  mealPlanDays: z.array(z.record(z.string(), z.unknown())).min(1),
  shoppingList: z.array(shoppingItemSchema).optional(),
});

export const humanizedListSchema = z.looseObject({
  items: z.array(
    z.looseObject({
      name: z.string().min(1),
      shoppingName: z.string().nullish(),
      quantity: optNum,
      unit: z.string().nullish(),
      notes: z.string().nullish(),
    }),
  ),
});

export type Recipe = z.infer<typeof recipeSchema>;
type Macros = z.infer<typeof macrosSchema>;
export type RawDay = { slots: Record<string, Recipe[]>; macros: Macros | null };
export type RawPlan = {
  constraints: unknown;
  days: RawDay[];
  shoppingList: z.infer<typeof shoppingItemSchema>[];
  /** The validated Passio object, kept to resend to Passio unchanged. */
  passio: Record<string, unknown>;
};

const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"];

export function orderedSlots(slots: string[]): string[] {
  const known = SLOT_ORDER.filter((s) => slots.includes(s));
  const other = slots.filter((s) => !SLOT_ORDER.includes(s)).sort();
  return [...known, ...other];
}

/** Validates a preview or full-plan body. Throws PROVIDER_BAD_RESPONSE on mismatch. */
export function parsePlanPayload(body: unknown): RawPlan {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) throw new AppError("PROVIDER_BAD_RESPONSE", "Passio meal-plan response was not in the expected format");
  const days: RawDay[] = parsed.data.mealPlanDays.map((day) => {
    const slots: Record<string, Recipe[]> = {};
    let macros: Macros | null = null;
    for (const [key, value] of Object.entries(day)) {
      if (key === "macros") {
        const m = macrosSchema.safeParse(value);
        macros = m.success ? m.data : null;
        continue;
      }
      const slot = slotSchema.safeParse(value);
      if (!slot.success) {
        throw new AppError("PROVIDER_BAD_RESPONSE", `Passio meal-plan slot "${key}" was not in the expected format`);
      }
      slots[key] = slot.data.recipes;
    }
    if (Object.keys(slots).length === 0) throw new AppError("PROVIDER_BAD_RESPONSE", "Passio meal-plan day had no meals");
    return { slots, macros };
  });
  return {
    constraints: parsed.data.constraints ?? null,
    days,
    shoppingList: parsed.data.shoppingList ?? [],
    passio: parsed.data as Record<string, unknown>,
  };
}

/** Drops heavy search-result fields from ingredients before storing (~70% smaller). */
export function minimizePlanPayload(passio: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(passio) as { mealPlanDays?: Record<string, unknown>[] };
  for (const day of copy.mealPlanDays ?? []) {
    for (const [key, slot] of Object.entries(day)) {
      if (key === "macros" || !slot || typeof slot !== "object") continue;
      for (const recipe of ((slot as { recipes?: Record<string, unknown>[] }).recipes ?? [])) {
        if (!Array.isArray(recipe.ingredients)) continue;
        recipe.ingredients = recipe.ingredients.map((i: Record<string, unknown>) => ({
          displayName: i.displayName,
          shortName: i.shortName,
          refCode: i.refCode,
          nutritionPreview: i.nutritionPreview,
        }));
      }
    }
  }
  return copy as Record<string, unknown>;
}

export type Rejection = { day: number; slot: string; index: number };

/** Returns the Passio preview object with the given meals marked `rejected: true`. */
export function applyRejections(passio: Record<string, unknown>, rejections: Rejection[]): Record<string, unknown> {
  const copy = structuredClone(passio) as { mealPlanDays: Record<string, { recipes?: { rejected?: boolean }[] }>[] };
  for (const r of rejections) {
    const recipe = copy.mealPlanDays[r.day - 1]?.[r.slot]?.recipes?.[r.index];
    if (!recipe || r.slot === "macros") throw new AppError("NOT_FOUND", `No meal at day ${r.day} ${r.slot} #${r.index}`);
    recipe.rejected = true;
  }
  return copy as Record<string, unknown>;
}

const SMALL_WORDS = new Set(["a", "an", "and", "or", "of", "with", "in", "on", "the", "to", "for"]);

/** Passio returns recipe names in varying case (lower-cased after regenerate). */
export function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const macroOrNull = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? round(v, 1) : null);

export type MacrosView = { calories: number | null; proteinG: number | null; carbohydratesG: number | null; fatG: number | null; fiberG: number | null };

export function macrosView(m: Macros | null | undefined): MacrosView | null {
  if (!m) return null;
  return {
    calories: macroOrNull(m.calories),
    proteinG: macroOrNull(m.protein),
    carbohydratesG: macroOrNull(m.carbs),
    fatG: macroOrNull(m.fat),
    fiberG: macroOrNull(m.fiber),
  };
}

export function daysView(plan: RawPlan) {
  return plan.days.map((d, i) => ({
    day: i + 1,
    macros: macrosView(d.macros),
    meals: orderedSlots(Object.keys(d.slots)).map((slot) => ({
      slot,
      recipes: d.slots[slot]!.map((r, index) => ({
        index,
        name: titleCase(r.name),
        rejected: r.rejected ?? false,
        preparation: r.preparation ?? null,
        macros: r.macros ? macrosView(r.macros) : null,
        ingredients: (r.ingredients ?? []).map((ing) => {
          const c = normalizeExtractItem(ing);
          return { name: c.name, serving: c.servings[0]?.label ?? null, calories: c.servings[0]?.nutrients.calories ?? null };
        }),
      })),
    })),
  }));
}

export function findRecipe(plan: RawPlan, day: number, slot: string, index: number): Recipe | null {
  return plan.days[day - 1]?.slots[slot]?.[index] ?? null;
}
