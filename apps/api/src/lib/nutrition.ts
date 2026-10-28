export const NUTRIENT_KEYS = ["calories", "proteinG", "carbohydratesG", "fatG"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Nutrient values; null means "not provided by the source", never zero. */
export type Nutrients = Record<NutrientKey, number | null>;

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Scales per-serving nutrients by quantity, keeping missing values missing. */
export function scaleNutrients(perServing: Nutrients, quantity: number): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) {
    const v = perServing[key];
    out[key] = v === null ? null : round(v * quantity, 1);
  }
  return out;
}

export type NutrientSummary = {
  total: number;
  /** Entries that had a value for this nutrient. */
  contributingEntries: number;
  /** Entries missing this nutrient; when > 0 the total is partial. */
  missingEntries: number;
};

export type DailySummary = {
  entryCount: number;
  nutrients: Record<NutrientKey, NutrientSummary>;
};

export function summarize(entries: Nutrients[]): DailySummary {
  const nutrients = {} as Record<NutrientKey, NutrientSummary>;
  for (const key of NUTRIENT_KEYS) {
    let total = 0;
    let contributing = 0;
    for (const e of entries) {
      const v = e[key];
      if (v !== null) {
        total += v;
        contributing += 1;
      }
    }
    nutrients[key] = {
      total: round(total, 1),
      contributingEntries: contributing,
      missingEntries: entries.length - contributing,
    };
  }
  return { entryCount: entries.length, nutrients };
}
