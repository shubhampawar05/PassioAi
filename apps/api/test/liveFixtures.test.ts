import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { normalizeExtractItem, normalizePassioFood } from "../src/recognition/normalize.js";
import { PassioProvider } from "../src/recognition/passioProvider.js";
import { ingredientExtractResponseSchema, passioFoodSchema } from "../src/recognition/passioSchemas.js";

/** Real Passio responses captured 2026-10-28 with a test key (public food data only). */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function providerReturning(body: unknown) {
  const responses = [
    new Response(JSON.stringify({ access_token: "t", expires_in: 86155, customer_id: "c" }), { status: 200 }),
    new Response(JSON.stringify(body), { status: 200 }),
  ];
  const fetchImpl = vi.fn(async () => responses.shift()!);
  return new PassioProvider({ apiKey: "k", baseUrl: "https://x", timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} });
}

describe("live Passio response shapes", () => {
  it("extractMealLogAction: flattens [{action, items[]}] and scales preview by quantity × weight", async () => {
    const result = await providerReturning(fixture("passio-extractMealLogAction.live.json")).recognizeText("eggs and toast");
    expect(result.candidates.map((c) => c.name)).toEqual(["Boiled Eggs", "Slice Of Whole Wheat Bread"]);
    const [eggs, bread] = result.candidates;
    // portion {quantity: 2, weight: 64 g} → nutrients are for 128 g.
    expect(eggs!.servings[0]).toMatchObject({ label: "2 large (128 g)", weightG: 128, defaultQuantity: 1 });
    expect(eggs!.servings[0]!.nutrients).toEqual({ calories: 198.4, proteinG: 16.1, carbohydratesG: 1.43, fatG: 13.58 });
    expect(bread!.servings[0]).toMatchObject({ label: "0.83 medium or regular slice (30 g)", weightG: 30 });
    expect(bread!.providerRef).toMatch(/^eyJ/);
  });

  it("extractMealLogAction: ignores items in a 'remove' action group", async () => {
    const body = [{ action: "remove", items: [{ displayName: "Cake" }] }, { action: "add", items: [{ displayName: "Tea" }] }];
    const result = await providerReturning(body).recognizeText("remove cake, add tea");
    expect(result.candidates.map((c) => c.name)).toEqual(["Tea"]);
  });

  it("extractIngredients: banana preview matches 1 × 118 g", () => {
    const [banana] = ingredientExtractResponseSchema.parse(fixture("passio-extractIngredients.live.json")).map(normalizeExtractItem);
    expect(banana!.servings[0]).toMatchObject({ label: 'medium (7" to 7-7/8" long) (118 g)', weightG: 118 });
    expect(banana!.servings[0]!.nutrients.calories).toBe(105.02);
  });

  it("productCode: matches documented shortNames and keeps ml portions", () => {
    const c = normalizePassioFood(passioFoodSchema.parse(fixture("passio-productCode.live.json")), "049000028911");
    expect(c.name).toBe("Diet Coke");
    expect(c.servings.map((s) => s.label)).toEqual(["can (355 ml)", "fl oz (30 ml)", "gram (1 g)", "millilitre (1 ml)", "cup (236 ml)", "100 g"]);
    const can = c.servings[0]!;
    expect(can.weightG).toBeNull(); // ml, not grams
    // Real zero values stay 0, not "missing".
    expect(can.nutrients).toEqual({ calories: 0, proteinG: 0, carbohydratesG: 0, fatG: 0 });
    expect(c.servings[2]).toMatchObject({ weightG: 1, defaultQuantity: 100 });
  });
});

describe("live label scan (extractPackagedProduct)", () => {
  it("defaults to the label's 2 × tbsp (16 g) serving, totalling the label's 190 kcal", () => {
    const c = normalizePassioFood(passioFoodSchema.parse(fixture("passio-extractPackagedProduct.live.json")));
    expect(c.name).toBe("Crunchy Peanut Butter");
    expect(c.providerRef).toBeNull();
    const tbsp = c.servings[0]!;
    expect(tbsp).toMatchObject({ label: "tbsp (16 g)", weightG: 16, defaultQuantity: 2 });
    expect(tbsp.nutrients).toEqual({ calories: 95, proteinG: 4, carbohydratesG: 3.5, fatG: 8 });
    // Default serving (2 tbsp) matches the printed label: 190 kcal, 8 g protein, 7 g carbs, 16 g fat.
    expect(tbsp.nutrients.calories! * tbsp.defaultQuantity).toBe(190);
    expect(c.providerDetails.ingredientsText).toBe("roasted peanuts; sugar; palm oil; salt");
  });
});
