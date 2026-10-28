import { describe, expect, it } from "vitest";
import { scaleNutrients, summarize } from "../src/lib/nutrition.js";

describe("scaleNutrients", () => {
  it("multiplies by quantity and rounds to one decimal", () => {
    expect(scaleNutrients({ calories: 100, proteinG: 10, carbohydratesG: 3.33, fatG: 0 }, 1.5)).toEqual({
      calories: 150,
      proteinG: 15,
      carbohydratesG: 5,
      fatG: 0,
    });
  });

  it("keeps missing values null instead of zero", () => {
    expect(scaleNutrients({ calories: 80, proteinG: null, carbohydratesG: null, fatG: 2 }, 2)).toEqual({
      calories: 160,
      proteinG: null,
      carbohydratesG: null,
      fatG: 4,
    });
  });
});

describe("summarize", () => {
  it("sums available values and counts entries", () => {
    const s = summarize([
      { calories: 200, proteinG: 10, carbohydratesG: 20, fatG: 5 },
      { calories: 350, proteinG: 12.25, carbohydratesG: 40, fatG: null },
    ]);
    expect(s.entryCount).toBe(2);
    expect(s.nutrients.calories).toEqual({ total: 550, contributingEntries: 2, missingEntries: 0 });
    expect(s.nutrients.proteinG.total).toBe(22.3);
    expect(s.nutrients.fatG).toEqual({ total: 5, contributingEntries: 1, missingEntries: 1 });
  });

  it("reports an empty day as zero with no contributors", () => {
    const s = summarize([]);
    expect(s.entryCount).toBe(0);
    expect(s.nutrients.calories).toEqual({ total: 0, contributingEntries: 0, missingEntries: 0 });
  });
});
