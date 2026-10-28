import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { NutritionGuidanceProvider } from "../src/advisor/guidanceProvider.js";
import { localDate } from "../src/advisor/routes.js";
import { createPrisma } from "../src/db/prisma.js";
import { AppError } from "../src/errors.js";
import { MockProvider } from "../src/recognition/mockProvider.js";

const prisma = createPrisma(process.env.TEST_DATABASE_URL!);
const USER = "advisor-user";

const guidance = {
  mode: "passio" as const,
  askAdvisor: vi.fn(async () => ({ answer: "Try a lentil bowl.", source: "passio" as const, requestId: "req-1" })),
  previewMealPlan: vi.fn(),
  generateMealPlan: vi.fn(),
  humanizeShoppingList: vi.fn(),
} satisfies NutritionGuidanceProvider;

const app = createApp({ prisma, provider: new MockProvider(), guidance, demoUserId: USER });

beforeEach(async () => {
  await prisma.foodLogEntry.deleteMany({ where: { demoUserId: USER } });
  await prisma.nutritionProfile.deleteMany({ where: { demoUserId: USER } });
  vi.clearAllMocks();
});
afterAll(async () => {
  await prisma.foodLogEntry.deleteMany({ where: { demoUserId: USER } });
  await prisma.nutritionProfile.deleteMany({ where: { demoUserId: USER } });
  await prisma.$disconnect();
});

async function seedToday() {
  await request(app)
    .put("/api/profile")
    .send({ goal: "more_protein", dailyCalorieTarget: 2000, dietPreferences: ["vegetarian"], avoidFoods: ["peanuts"] })
    .expect(200);
  await request(app)
    .post("/api/food-logs")
    .send({
      inputType: "text",
      inputSummary: "oatmeal",
      foodName: "Dry Oatmeal",
      servingUnit: "cup (81 g)",
      quantity: 1,
      perServing: { calories: 307, proteinG: 10.7, carbohydratesG: 54.8, fatG: null },
      provider: "passio",
    })
    .expect(201);
}

describe("POST /api/advisor", () => {
  it("answers with Passio's text using profile and today's log as context", async () => {
    await seedToday();
    const res = await request(app).post("/api/advisor").send({ question: "What should I have for dinner tonight?", tz: "UTC" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: "Try a lentil bowl.", source: "passio", requestId: "req-1" });
    const [content, context] = guidance.askAdvisor.mock.calls[0] as unknown as [string, string];
    expect(content).toBe("What should I have for dinner tonight?");
    expect(context).toMatch(/^You are a general nutrition information assistant/);
    expect(context).toContain("Vegetarian");
    expect(context).toContain("peanuts");
    expect(context).toContain("Dry Oatmeal: 307 kcal");
    expect(context).toContain("calories 307 kcal");
    expect(context).toContain("fat not available");
    expect(context).toContain(`Logged today (${localDate("UTC")})`);
  });

  it("passes up to 3 history turns", async () => {
    const history = [{ question: "snack?", answer: "Greek yogurt." }];
    await request(app).post("/api/advisor").send({ question: "And for lunch?", history }).expect(200);
    const [, context] = guidance.askAdvisor.mock.calls[0] as unknown as [string, string];
    expect(context).toContain("Q: snack?\nA: Greek yogurt.");
  });

  it.each([
    [{ question: "" }],
    [{ question: "x".repeat(501) }],
    [{ question: "ok", history: Array.from({ length: 4 }, () => ({ question: "q", answer: "a" })) }],
    [{ question: "ok", tz: "Not/AZone" }],
  ])("rejects %j without calling Passio", async (body) => {
    const res = await request(app).post("/api/advisor").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(guidance.askAdvisor).not.toHaveBeenCalled();
  });

  it("declines medical questions with 422 and no Passio call", async () => {
    const res = await request(app).post("/api/advisor").send({ question: "What should I eat to reduce Ozempic nausea?" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ADVISOR_OUT_OF_SCOPE");
    expect(res.body.error.message).toMatch(/qualified health professional/);
    expect(guidance.askAdvisor).not.toHaveBeenCalled();
  });

  it.each([
    ["PROVIDER_QUOTA", 429],
    ["PROVIDER_TIMEOUT", 504],
    ["PROVIDER_NOT_CONFIGURED", 503],
  ] as const)("returns %s as HTTP %i without a fabricated answer", async (code, status) => {
    guidance.askAdvisor.mockRejectedValueOnce(new AppError(code, "failed"));
    const res = await request(app).post("/api/advisor").send({ question: "snack idea" });
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: "failed" } });
  });

  it("does not log or store the question or answer", async () => {
    const logs: string[] = [];
    const spies = (["info", "log", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(" "))),
    );
    const secret = "unique-question-marker-7f3a";
    await request(app).post("/api/advisor").send({ question: `High protein ${secret} snack?` }).expect(200);
    spies.forEach((s) => s.mockRestore());
    expect(logs.join("\n")).not.toContain(secret);
    expect(logs.join("\n")).not.toContain("lentil bowl");
    const dump = JSON.stringify([
      await prisma.foodLogEntry.findMany({ where: { demoUserId: USER } }),
      await prisma.nutritionProfile.findMany({ where: { demoUserId: USER } }),
    ]);
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain("lentil bowl");
  });
});

describe("localDate", () => {
  it("uses the requested timezone's calendar date", () => {
    const instant = new Date("2026-10-29T03:30:00Z");
    expect(localDate("UTC", instant)).toBe("2026-10-29");
    expect(localDate("America/New_York", instant)).toBe("2026-10-28");
  });
});
