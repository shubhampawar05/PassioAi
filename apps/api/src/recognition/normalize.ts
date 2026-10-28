import { round, type NutrientKey, type Nutrients } from "../lib/nutrition.js";
import type {
  IngredientExtractItem,
  PassioFood,
  PassioNutrientEntry,
  PassioPortion,
} from "./passioSchemas.js";
import type { FoodCandidate, ServingOption } from "./types.js";

function validNumber(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function positive(v: number | null | undefined): number | null {
  const n = validNumber(v);
  return n !== null && n > 0 ? n : null;
}

function nutrientsOrNull(n: Nutrients): Nutrients {
  return {
    calories: n.calories === null ? null : round(n.calories, 2),
    proteinG: n.proteinG === null ? null : round(n.proteinG, 2),
    carbohydratesG: n.carbohydratesG === null ? null : round(n.carbohydratesG, 2),
    fatG: n.fatG === null ? null : round(n.fatG, 2),
  };
}

type Measure = { value: number; unit: "g" | "ml" };

/** Portion weight in g or ml. Live barcode data uses ml for drinks (e.g. "can" = 355 ml). */
function measureOf(portion: PassioPortion | null | undefined): Measure | null {
  const w = portion?.weight;
  const value = validNumber(w?.value);
  if (value === null || value === 0) return null;
  const unit = (w?.unit ?? "").trim().toLowerCase();
  if (unit === "g" || unit === "gram" || unit === "grams") return { value, unit: "g" };
  if (unit === "ml" || unit === "milliliter" || unit === "millilitre") return { value, unit: "ml" };
  return null;
}

function servingLabel(name: string | undefined, quantity: number, total: Measure | null): string {
  const qty = quantity === 1 ? "" : `${round(quantity, 2)} `;
  const amount = total ? `${round(total.value, 1)} ${total.unit}` : null;
  if (name) return amount ? `${qty}${name} (${amount})` : `${qty}${name}`;
  return amount ?? "1 serving";
}

/**
 * Photo/text extraction item → candidate. `nutritionPreview` values describe
 * `portion.quantity × portion.weight` (verified live 2026-10-28: banana 1 × 118 g →
 * 105 kcal; eggs 2 × 64 g → 198 kcal). Missing values stay null.
 */
export function normalizeExtractItem(item: IngredientExtractItem): FoodCandidate {
  const name =
    item.displayName?.trim() || item.ingredientName?.trim() || item.shortName?.trim() || "Unnamed food";
  const preview = item.nutritionPreview;
  const portion = preview?.portion;
  const quantity = validNumber(portion?.quantity) || 1;
  const unit = measureOf(portion);
  const fallbackGrams = validNumber(item.weightGrams);
  const total: Measure | null = unit
    ? { value: unit.value * quantity, unit: unit.unit }
    : fallbackGrams
      ? { value: fallbackGrams, unit: "g" }
      : null;
  const serving: ServingOption = {
    label: servingLabel(portion?.name?.trim() || undefined, unit ? quantity : 1, total),
    weightG: total?.unit === "g" ? round(total.value, 1) : null,
    defaultQuantity: 1,
    nutrients: nutrientsOrNull({
      calories: validNumber(preview?.calories),
      proteinG: validNumber(preview?.protein),
      carbohydratesG: validNumber(preview?.carbs),
      fatG: validNumber(preview?.fat),
    }),
  };
  return {
    name,
    providerRef: item.refCode ?? null,
    servings: [serving],
    providerDetails: compact({
      ingredientName: item.ingredientName,
      mealName: item.mealName,
      portionSize: item.portionSize,
      portionQuantity: item.portionQuantity,
      weightGrams: item.weightGrams,
      type: item.type,
      score: item.score,
    }),
  };
}

const FAT_NAMES = new Set(["fat", "total fat", "total lipid (fat)", "fat, total", "total lipids"]);

/** Which of our four nutrients a Passio nutrient entry represents, if any. */
export function classifyNutrient(entry: PassioNutrientEntry): NutrientKey | null {
  const short = entry.nutrient?.shortName?.trim().toLowerCase() ?? "";
  const name = entry.nutrient?.name?.trim().toLowerCase() ?? "";
  const unit = entry.nutrient?.unit?.trim().toLowerCase() ?? "";
  if (short === "calories" || (name === "energy" && unit === "kcal")) return "calories";
  if (short === "protein" || /^protein\b/.test(name)) return "proteinG";
  if (short === "carbs" || short === "carbohydrates" || /carbohydrate/.test(name)) return "carbohydratesG";
  if (short === "fat" || FAT_NAMES.has(name)) return "fatG";
  return null;
}

/** Per-100 g nutrients from PassioFood, summing ingredient-level values when no top-level list exists. */
export function per100g(food: PassioFood): Nutrients {
  const lists =
    food.nutrients && food.nutrients.length > 0
      ? [food.nutrients]
      : (food.ingredients ?? []).map((i) => i.nutrients ?? []);
  const out: Nutrients = { calories: null, proteinG: null, carbohydratesG: null, fatG: null };
  for (const list of lists) {
    for (const entry of list) {
      const key = classifyNutrient(entry);
      const amount = validNumber(entry.amount);
      if (key && amount !== null) out[key] = (out[key] ?? 0) + amount;
    }
  }
  return out;
}

function scaleFrom100g(n: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return nutrientsOrNull({
    calories: n.calories === null ? null : n.calories * f,
    proteinG: n.proteinG === null ? null : n.proteinG * f,
    carbohydratesG: n.carbohydratesG === null ? null : n.carbohydratesG * f,
    fatG: n.fatG === null ? null : n.fatG * f,
  });
}

/**
 * Barcode PassioFood → candidate. Nutrients are per 100 g (per 100 ml for drinks);
 * each portion becomes a serving option scaled by its weight, following the
 * documented, unit-agnostic formula N = amount × w/100 × q. No portions → a
 * single 100 g serving, as the docs instruct.
 */
export function normalizePassioFood(food: PassioFood, barcode: string | null = null): FoodCandidate {
  const base = per100g(food);
  const servings: ServingOption[] = [];
  for (const portion of food.portions ?? []) {
    const measure = measureOf(portion);
    if (!measure) continue;
    const q = portion.suggestedQuantity?.[0];
    servings.push({
      label: servingLabel(portion.name?.trim() || undefined, 1, measure),
      weightG: measure.unit === "g" ? measure.value : null,
      // Label portions carry the serving count in `quantity` (e.g. 2 × tbsp of 16 g).
      defaultQuantity: positive(q) ?? positive(portion.quantity) ?? 1,
      nutrients: scaleFrom100g(base, measure.value),
    });
  }
  if (!servings.some((s) => s.weightG === 100)) {
    servings.push({ label: "100 g", weightG: 100, defaultQuantity: 1, nutrients: nutrientsOrNull(base) });
  }
  return {
    name: food.name.trim(),
    providerRef: food.refCode ?? food.branded?.productCode ?? barcode ?? null,
    servings,
    providerDetails: compact({
      passioFoodId: food.id,
      brandOwner: food.branded?.owner,
      ingredientsText: food.branded?.ingredients?.trim().slice(0, 1000) || undefined,
      productCode: food.branded?.productCode ?? barcode,
    }),
  };
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}
