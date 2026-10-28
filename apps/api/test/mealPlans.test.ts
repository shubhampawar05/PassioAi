import { readFileSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { NutritionGuidanceProvider, PlanResult } from "../src/advisor/guidanceProvider.js";
import { createPrisma } from "../src/db/prisma.js";
import { AppError } from "../src/errors.js";
import { recoverInterruptedPlans, type MealPlanJobs } from "../src/mealPlans/jobs.js";
import { parsePlanPayload } from "../src/mealPlans/plan.js";
import { MockProvider } from "../src/recognition/mockProvider.js";

const prisma = createPrisma(process.env.TEST_DATABASE_URL!);
const USER = "mealplan-user";
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const result = (name: string): PlanResult => ({ plan: parsePlanPayload(fixture(name)), source: "passio", requestId: "r" });

const guidance = {
  mode: "passio" as const,
  askAdvisor: vi.fn(),
  previewMealPlan: vi.fn(async (content: string) =>
    result(content.startsWith("{") ? "passio-generateMealPlanPreview-regenerate.live.json" : "passio-generateMealPlanPreview.live.json"),
  ),
  generateMealPlan: vi.fn(async (_content: string) => result("passio-generateMealPlan.live.json")),
  humanizeShoppingList: vi.fn(async (_content: string) => [
    { name: "Fresh Strawberries", shoppingName: "Fresh Strawberries", quantity: 1, unit: "pound", notes: "approx 450g" },
  ]),
} satisfies NutritionGuidanceProvider;

const app = createApp({ prisma, provider: new MockProvider(), guidance, demoUserId: USER });
const jobs = app.locals.mealPlanJobs as MealPlanJobs;

async function clean() {
  await prisma.mealPlan.deleteMany({ where: { demoUserId: USER } });
  await prisma.foodLogEntry.deleteMany({ where: { demoUserId: USER } });
  await prisma.nutritionProfile.deleteMany({ where: { demoUserId: USER } });
}
beforeEach(async () => {
  await clean();
  vi.clearAllMocks();
});
afterAll(async () => {
  await jobs.idle();
  await clean();
  await prisma.$disconnect();
});

async function readyPlan() {
  const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
  await request(app).post(`/api/meal-plans/${created.body.id}/approve`).expect(202);
  await jobs.idle();
  return created.body.id as string;
}

describe("POST /api/meal-plans (preview)", () => {
  it("creates a preview from the profile and returns meals by day and slot", async () => {
    await request(app)
      .put("/api/profile")
      .send({ goal: "more_protein", dailyCalorieTarget: 2000, dietPreferences: ["vegetarian"], avoidFoods: ["peanuts"] })
      .expect(200);
    const res = await request(app).post("/api/meal-plans").send({ days: 2, notes: "quick lunches" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "preview", dayCount: 2, notes: "quick lunches", source: "passio" });
    expect(res.body.days[0].meals.map((m: { slot: string }) => m.slot)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(res.body.days.flatMap((d: { meals: { recipes: { rejected: boolean }[] }[] }) => d.meals.flatMap((m) => m.recipes.map((r) => r.rejected)))).not.toContain(true);
    const content = guidance.previewMealPlan.mock.calls[0]![0];
    expect(content).toContain("Generate a 2 day meal plan.");
    expect(content).toContain("Avoid: peanuts.");
    expect(content).toContain("Notes: quick lunches");
  });

  it.each([[{ days: 0 }], [{ days: 8 }], [{ days: 2, notes: "x".repeat(301) }]])("rejects %j without calling Passio", async (body) => {
    const res = await request(app).post("/api/meal-plans").send(body);
    expect(res.status).toBe(400);
    expect(guidance.previewMealPlan).not.toHaveBeenCalled();
  });

  it("declines out-of-scope notes with 422", async () => {
    const res = await request(app).post("/api/meal-plans").send({ days: 2, notes: "fit around my insulin dose" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ADVISOR_OUT_OF_SCOPE");
    expect(guidance.previewMealPlan).not.toHaveBeenCalled();
  });

  it("returns provider errors without creating a plan", async () => {
    guidance.previewMealPlan.mockRejectedValueOnce(new AppError("PROVIDER_QUOTA", "quota"));
    expect((await request(app).post("/api/meal-plans").send({ days: 2 })).status).toBe(429);
    expect(await prisma.mealPlan.count({ where: { demoUserId: USER } })).toBe(0);
  });
});

describe("list, get, delete", () => {
  it("lists newest first, 404s unknown ids, and deleting keeps logged entries", async () => {
    const a = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    const b = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    const list = await request(app).get("/api/meal-plans");
    expect(list.body.plans.map((p: { id: string }) => p.id)).toEqual([b.body.id, a.body.id]);
    expect((await request(app).get(`/api/meal-plans/${a.body.id}`)).body.id).toBe(a.body.id);
    expect((await request(app).get("/api/meal-plans/7f1e0e8c-5c1a-4c9e-9a51-2b2f1f0c0a11")).status).toBe(404);
    expect((await request(app).get("/api/meal-plans/nope")).status).toBe(400);

    const id = await readyPlan();
    await request(app).post(`/api/meal-plans/${id}/log`).send({ day: 1, slot: "breakfast", index: 0 }).expect(201);
    expect((await request(app).delete(`/api/meal-plans/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/meal-plans/${id}`)).status).toBe(404);
    expect(await prisma.foodLogEntry.count({ where: { demoUserId: USER, inputType: "meal_plan" } })).toBe(1);
  });
});

describe("POST /api/meal-plans/:id/regenerate", () => {
  it("sends the stored preview with rejected flags and replaces it", async () => {
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    const res = await request(app)
      .post(`/api/meal-plans/${created.body.id}/regenerate`)
      .send({ rejected: [{ day: 1, slot: "dinner", index: 0 }] });
    expect(res.status).toBe(200);
    const sent = JSON.parse(guidance.previewMealPlan.mock.calls[1]![0]);
    expect(sent.mealPlanDays[0].dinner.recipes[0].rejected).toBe(true);
    expect(sent.mealPlanDays[0].lunch.recipes[0].rejected).toBe(false);
    expect(res.body.days[0].meals[2].recipes[0].name).toBe("High Protein Seitan and Vegetable Stir-fry");
    const stored = await prisma.mealPlan.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(JSON.stringify(stored.previewPayload)).toContain("seitan");
  });

  it("404s unknown meals and 409s outside preview", async () => {
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    expect((await request(app).post(`/api/meal-plans/${created.body.id}/regenerate`).send({ rejected: [{ day: 5, slot: "dinner", index: 0 }] })).status).toBe(404);
    expect((await request(app).post(`/api/meal-plans/${created.body.id}/regenerate`).send({ rejected: [] })).status).toBe(400);
    const id = await readyPlan();
    const res = await request(app).post(`/api/meal-plans/${id}/regenerate`).send({ rejected: [{ day: 1, slot: "dinner", index: 0 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
  });
});

describe("approve and background generation", () => {
  it("returns 202 generating, then becomes ready with recipes and macros", async () => {
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    const approved = await request(app).post(`/api/meal-plans/${created.body.id}/approve`);
    expect(approved.status).toBe(202);
    expect(approved.body.status).toBe("generating");
    await jobs.idle();
    const ready = await request(app).get(`/api/meal-plans/${created.body.id}`);
    expect(ready.body.status).toBe("ready");
    const breakfast = ready.body.days[0].meals[0].recipes[0];
    expect(breakfast).toMatchObject({ name: "High Protein Greek Yogurt Bowl with Berries and Chia Seeds", macros: { calories: 370.2, proteinG: 48.1 } });
    expect(breakfast.ingredients.length).toBeGreaterThan(0);
    expect(ready.body.days[0].macros.calories).toBe(2103.4);
    expect(ready.body.shoppingList.length).toBe(33);
    // Stored plan is minimized.
    const row = await prisma.mealPlan.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(JSON.stringify(row.planPayload)).not.toContain("labelId");
    // Approve sends the stored preview.
    expect(JSON.parse(guidance.generateMealPlan.mock.calls[0]![0]).mealPlanDays).toHaveLength(2);
  });

  it.each([
    ["PROVIDER_TIMEOUT"],
    ["PROVIDER_BAD_RESPONSE"],
  ] as const)("marks the plan failed with %s and allows re-approval", async (code) => {
    guidance.generateMealPlan.mockRejectedValueOnce(new AppError(code, "nope"));
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    await request(app).post(`/api/meal-plans/${created.body.id}/approve`).expect(202);
    await jobs.idle();
    const failed = await request(app).get(`/api/meal-plans/${created.body.id}`);
    expect(failed.body).toMatchObject({ status: "failed", errorCode: code });
    await request(app).post(`/api/meal-plans/${created.body.id}/approve`).expect(202);
    await jobs.idle();
    expect((await request(app).get(`/api/meal-plans/${created.body.id}`)).body.status).toBe("ready");
  });

  it("refuses to approve a ready plan", async () => {
    const id = await readyPlan();
    expect((await request(app).post(`/api/meal-plans/${id}/approve`)).status).toBe(409);
  });

  it("marks plans left generating as INTERRUPTED on startup", async () => {
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    await prisma.mealPlan.update({ where: { id: created.body.id }, data: { status: "generating" } });
    expect(await recoverInterruptedPlans(prisma)).toBeGreaterThanOrEqual(1);
    expect((await request(app).get(`/api/meal-plans/${created.body.id}`)).body).toMatchObject({ status: "failed", errorCode: "INTERRUPTED" });
  });
});

describe("shopping list and logging", () => {
  it("humanizes the shopping list and stores it", async () => {
    const id = await readyPlan();
    const res = await request(app).post(`/api/meal-plans/${id}/shopping-list/humanize`);
    expect(res.status).toBe(200);
    expect(res.body.shoppingListHumanized[0]).toMatchObject({ shoppingName: "Fresh Strawberries", quantity: 1, unit: "pound" });
    expect(guidance.humanizeShoppingList.mock.calls[0]![0].split("\n")[0]).toBe("Fresh Broccoli, 1, cup");
  });

  it("logs a recipe with server-side macros, included in the daily summary", async () => {
    const id = await readyPlan();
    const res = await request(app).post(`/api/meal-plans/${id}/log`).send({ day: 1, slot: "breakfast", index: 0, calories: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      inputType: "meal_plan",
      foodName: "High Protein Greek Yogurt Bowl with Berries and Chia Seeds",
      servingUnit: "1 recipe",
      quantity: 1,
      totals: { calories: 370.2, proteinG: 48.1 },
    });
    const today = new Date().toISOString().slice(0, 10);
    const s = await request(app).get("/api/nutrition-summary").query({ date: today });
    expect(s.body.nutrients.calories.total).toBe(370.2);
  });

  it("409s when not ready and 404s missing recipes", async () => {
    const created = await request(app).post("/api/meal-plans").send({ days: 2 }).expect(201);
    expect((await request(app).post(`/api/meal-plans/${created.body.id}/log`).send({ day: 1, slot: "breakfast", index: 0 })).status).toBe(409);
    expect((await request(app).post(`/api/meal-plans/${created.body.id}/shopping-list/humanize`)).status).toBe(409);
    const id = await readyPlan();
    expect((await request(app).post(`/api/meal-plans/${id}/log`).send({ day: 1, slot: "brunch", index: 0 })).status).toBe(404);
    expect((await request(app).post(`/api/meal-plans/${id}/log`).send({ day: 3, slot: "breakfast", index: 0 })).status).toBe(404);
    expect(await prisma.foodLogEntry.count({ where: { demoUserId: USER } })).toBe(0);
  });
});
