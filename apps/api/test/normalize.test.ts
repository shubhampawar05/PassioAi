import { describe, expect, it } from "vitest";
import { classifyNutrient, normalizeExtractItem, normalizePassioFood, per100g } from "../src/recognition/normalize.js";
import { ingredientExtractResponseSchema, passioFoodSchema } from "../src/recognition/passioSchemas.js";

describe("normalizeExtractItem (vision/text routes)", () => {
  it("maps nutritionPreview and portion into one serving", () => {
    const [item] = ingredientExtractResponseSchema.parse([
      {
        ingredientName: "scrambled eggs",
        displayName: "Scrambled Eggs",
        refCode: "eyJyZWYiOiJ4In0",
        mealName: "Breakfast",
        nutritionPreview: {
          portion: { name: "cup", quantity: 1, weight: { unit: "g", value: 220 }, suggestedQuantity: [1] },
          calories: 330.456,
          protein: 22,
          carbs: 4.4,
          fat: 24.2,
          fiber: 0,
        },
        undocumentedExtra: { ok: true },
      },
    ]);
    const c = normalizeExtractItem(item!);
    expect(c.name).toBe("Scrambled Eggs");
    expect(c.providerRef).toBe("eyJyZWYiOiJ4In0");
    expect(c.servings).toEqual([
      {
        label: "cup (220 g)",
        weightG: 220,
        defaultQuantity: 1,
        nutrients: { calories: 330.46, proteinG: 22, carbohydratesG: 4.4, fatG: 24.2 },
      },
    ]);
    expect(c.providerDetails).toMatchObject({ mealName: "Breakfast", ingredientName: "scrambled eggs" });
  });

  it("leaves nutrients null when nutritionPreview is missing or partial", () => {
    const items = ingredientExtractResponseSchema.parse([
      { ingredientName: "mystery stew", weightGrams: 300 },
      { displayName: "Apple", nutritionPreview: { calories: 95, fat: null } },
    ]);
    const [stew, apple] = items.map(normalizeExtractItem);
    expect(stew!.name).toBe("mystery stew");
    expect(stew!.servings[0]).toMatchObject({ label: "300 g", weightG: 300 });
    expect(stew!.servings[0]!.nutrients).toEqual({ calories: null, proteinG: null, carbohydratesG: null, fatG: null });
    expect(apple!.servings[0]!.label).toBe("1 serving");
    expect(apple!.servings[0]!.nutrients).toEqual({ calories: 95, proteinG: null, carbohydratesG: null, fatG: null });
  });

  it("treats negative or non-numeric nutrient values as unavailable", () => {
    const [item] = ingredientExtractResponseSchema.parse([{ displayName: "X", nutritionPreview: { calories: -5 } }]);
    expect(normalizeExtractItem(item!).servings[0]!.nutrients.calories).toBeNull();
    expect(ingredientExtractResponseSchema.safeParse([{ nutritionPreview: { calories: "lots" } }]).success).toBe(false);
  });
});

const energy = (amount: number) => ({ amount, nutrient: { name: "Energy", unit: "KCAL", shortName: "calories" } });

describe("PassioFood (barcode) normalization", () => {
  it("classifies nutrients by shortName or name and ignores sub-fats", () => {
    expect(classifyNutrient(energy(1))).toBe("calories");
    expect(classifyNutrient({ nutrient: { name: "Protein", unit: "G" } })).toBe("proteinG");
    expect(classifyNutrient({ nutrient: { name: "Carbohydrate, by difference", unit: "G" } })).toBe("carbohydratesG");
    expect(classifyNutrient({ nutrient: { name: "Total lipid (fat)", unit: "G" } })).toBe("fatG");
    expect(classifyNutrient({ nutrient: { name: "Fatty acids, total saturated", unit: "G", shortName: "satFat" } })).toBeNull();
    expect(classifyNutrient({ nutrient: { name: "Energy", unit: "KJ" } })).toBeNull();
  });

  it("scales per-100 g nutrients to each portion and adds a 100 g option", () => {
    const food = passioFoodSchema.parse({
      id: "1234",
      name: " Peanut Butter ",
      refCode: "ref-pb",
      nutrients: [
        energy(588),
        { amount: 25, nutrient: { name: "Protein", unit: "G", shortName: "protein" } },
        { amount: 20, nutrient: { name: "Carbohydrates", unit: "G", shortName: "carbs" } },
        { amount: 50, nutrient: { name: "Fat", unit: "G", shortName: "fat" } },
      ],
      portions: [{ name: "tbsp", quantity: 1, weight: { unit: "g", value: 16 }, suggestedQuantity: [2] }],
    });
    const c = normalizePassioFood(food, "012345678905");
    expect(c.name).toBe("Peanut Butter");
    expect(c.providerRef).toBe("ref-pb");
    expect(c.servings[0]).toEqual({
      label: "tbsp (16 g)",
      weightG: 16,
      defaultQuantity: 2,
      nutrients: { calories: 94.08, proteinG: 4, carbohydratesG: 3.2, fatG: 8 },
    });
    expect(c.servings[1]).toMatchObject({ label: "100 g", weightG: 100, nutrients: { calories: 588 } });
  });

  it("assumes a 100 g serving when there are no portions", () => {
    const c = normalizePassioFood(passioFoodSchema.parse({ name: "Plain", nutrients: [energy(50)] }), "123456");
    expect(c.servings).toHaveLength(1);
    expect(c.servings[0]).toMatchObject({ label: "100 g", nutrients: { calories: 50, proteinG: null } });
    expect(c.providerRef).toBe("123456");
  });

  it("sums ingredient-level nutrients when no top-level list is present", () => {
    const food = passioFoodSchema.parse({
      name: "Combo",
      ingredients: [{ nutrients: [energy(100)] }, { nutrients: [energy(50)] }],
    });
    expect(per100g(food)).toEqual({ calories: 150, proteinG: null, carbohydratesG: null, fatG: null });
  });

  it("rejects a barcode body without a name", () => {
    expect(passioFoodSchema.safeParse({ nutrients: [] }).success).toBe(false);
  });
});
