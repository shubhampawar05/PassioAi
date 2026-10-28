import type { NutrientKey } from "./api";

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbohydratesG", label: "Carbohydrates", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
];

export const NOT_AVAILABLE = "Not available";

export function formatNutrient(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString()} ${unit}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function shiftIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toIsoDate(new Date(y!, m! - 1, d! + days));
}

export function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const INPUT_LABELS = { photo: "Photo", text: "Text", barcode: "Barcode", voice: "Voice", label: "Label", meal_plan: "Meal plan" } as const;
