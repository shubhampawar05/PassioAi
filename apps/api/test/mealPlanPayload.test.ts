import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRejections,
  daysView,
  findRecipe,
  humanizedListSchema,
  minimizePlanPayload,
  orderedSlots,
  parsePlanPayload,
  titleCase,
} from "../src/mealPlans/plan.js";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("meal-plan payloads (live fixtures)", () => {
  it("parses the live preview shape into ordered slots", () => {
    const plan = parsePlanPayload(fixture("passio-generateMealPlanPreview.live.json"));
    expect(plan.days).toHaveLength(2);
    const view = daysView(plan);
    expect(view[0]!.meals.map((m) => m.slot)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(view[0]!.meals[2]!.recipes[0]).toMatchObject({ index: 0, name: "Lentil and Black Bean Vegetarian Chili", rejected: false, macros: null });
    expect(view[0]!.macros).toBeNull();
  });

  it("parses the full plan with recipe and day macros, ingredients, and the shopping list", () => {
    const plan = parsePlanPayload(fixture("passio-generateMealPlan.live.json"));
    const view = daysView(plan);
    const breakfast = view[0]!.meals[0]!.recipes[0]!;
    expect(breakfast.name).toBe("High Protein Greek Yogurt Bowl with Berries and Chia Seeds");
    expect(breakfast.macros).toEqual({ calories: 370.2, proteinG: 48.1, carbohydratesG: 28.7, fatG: 8, fiberG: 6.2 });
    expect(breakfast.ingredients[0]).toMatchObject({ name: "Non Fat Greek Yogurt", serving: "cup (245 g)" });
    expect(breakfast.preparation).toMatch(/protein powder/);
    expect(view[0]!.macros!.calories).toBe(2103.4);
    expect(plan.shoppingList.length).toBe(33);
    expect(plan.shoppingList[0]).toMatchObject({ name: "Fresh Broccoli", portionQuantity: 1, portionSize: "cup" });
  });

  it("shows a missing recipe macro as null, never zero", () => {
    const body = { mealPlanDays: [{ dinner: { recipes: [{ name: "stew", macros: { calories: 400, protein: 20 } }] } }] };
    const r = daysView(parsePlanPayload(body))[0]!.meals[0]!.recipes[0]!;
    expect(r.macros).toEqual({ calories: 400, proteinG: 20, carbohydratesG: null, fatG: null, fiberG: null });
  });

  it("rejects malformed payloads", () => {
    expect(() => parsePlanPayload({ mealPlanDays: [] })).toThrow(/expected format/);
    expect(() => parsePlanPayload([{ day: 1, meals: [] }])).toThrow(/expected format/);
    expect(() => parsePlanPayload({ mealPlanDays: [{ lunch: { name: "x" } }] })).toThrow(/slot "lunch"/);
    expect(() => parsePlanPayload({ mealPlanDays: [{ macros: {} }] })).toThrow(/no meals/);
  });

  it("minimizes ingredients before storage while keeping what the UI needs", () => {
    const raw = fixture("passio-generateMealPlan.live.json") as Record<string, unknown>;
    const min = minimizePlanPayload(raw);
    expect(JSON.stringify(min).length).toBeLessThan(JSON.stringify(raw).length * 0.5);
    const reparsed = daysView(parsePlanPayload(min));
    expect(reparsed[0]!.meals[0]!.recipes[0]!.ingredients[0]).toMatchObject({ name: "Non Fat Greek Yogurt", serving: "cup (245 g)" });
  });

  it("marks rejected meals and refuses unknown targets", () => {
    const raw = parsePlanPayload(fixture("passio-generateMealPlanPreview.live.json")).passio;
    const out = applyRejections(raw, [{ day: 1, slot: "dinner", index: 0 }]);
    const view = daysView(parsePlanPayload(out));
    expect(view[0]!.meals[2]!.recipes[0]!.rejected).toBe(true);
    expect(view[0]!.meals[0]!.recipes[0]!.rejected).toBe(false);
    // Original is untouched.
    expect(daysView(parsePlanPayload(raw))[0]!.meals[2]!.recipes[0]!.rejected).toBe(false);
    expect(() => applyRejections(raw, [{ day: 9, slot: "dinner", index: 0 }])).toThrow(/No meal/);
    expect(() => applyRejections(raw, [{ day: 1, slot: "macros", index: 0 }])).toThrow(/No meal/);
  });

  it("finds recipes by day, slot, and index", () => {
    const plan = parsePlanPayload(fixture("passio-generateMealPlan.live.json"));
    expect(findRecipe(plan, 1, "breakfast", 0)?.macros?.calories).toBeCloseTo(370.21, 2);
    expect(findRecipe(plan, 3, "breakfast", 0)).toBeNull();
    expect(findRecipe(plan, 1, "brunch", 0)).toBeNull();
  });
});

describe("humanized shopping list (live fixture)", () => {
  it("parses items with shopping names, quantities, units, and notes", () => {
    const list = humanizedListSchema.parse(fixture("passio-humanizeShoppingList.live.json"));
    expect(list.items[0]).toMatchObject({ name: "Fresh Strawberries", quantity: 1, unit: "pound", notes: "approx 450g" });
    expect(humanizedListSchema.safeParse({ list: [] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("orders known slots first, then others alphabetically", () => {
    expect(orderedSlots(["snack", "zeta", "dinner", "alpha", "breakfast"])).toEqual(["breakfast", "dinner", "snack", "alpha", "zeta"]);
  });
  it("title-cases names, keeping small words lower-case", () => {
    expect(titleCase("high protein seitan and vegetable stir-fry")).toBe("High Protein Seitan and Vegetable Stir-fry");
  });
});
