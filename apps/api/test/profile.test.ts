import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrisma } from "../src/db/prisma.js";
import { MockProvider } from "../src/recognition/mockProvider.js";

const prisma = createPrisma(process.env.TEST_DATABASE_URL!);
const app = createApp({ prisma, provider: new MockProvider(), demoUserId: "profile-user" });

const valid = { goal: "more_protein", dailyCalorieTarget: 2000, dietPreferences: ["vegetarian"], avoidFoods: ["Peanuts"] };

beforeEach(async () => {
  await prisma.nutritionProfile.deleteMany({});
});
afterAll(async () => {
  await prisma.nutritionProfile.deleteMany({});
  await prisma.$disconnect();
});

describe("profile", () => {
  it("returns defaults when nothing is saved", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ goal: "balanced", dailyCalorieTarget: null, dietPreferences: [], avoidFoods: [], updatedAt: null });
  });

  it("saves and re-reads a valid profile", async () => {
    const put = await request(app).put("/api/profile").send(valid);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ goal: "more_protein", dailyCalorieTarget: 2000, dietPreferences: ["vegetarian"], avoidFoods: ["peanuts"] });
    expect(put.body.updatedAt).not.toBeNull();
    const get = await request(app).get("/api/profile");
    expect(get.body).toEqual(put.body);
    // Upsert replaces rather than duplicating.
    await request(app).put("/api/profile").send({ ...valid, goal: "more_fiber" }).expect(200);
    expect(await prisma.nutritionProfile.count()).toBe(1);
  });

  it.each([
    [{ dailyCalorieTarget: 500 }],
    [{ dailyCalorieTarget: 2000.5 }],
    [{ goal: "lose_weight" }],
    [{ dietPreferences: ["keto"] }],
    [{ avoidFoods: Array.from({ length: 11 }, (_, i) => `food${i}`) }],
    [{ avoidFoods: ["x".repeat(41)] }],
  ])("rejects invalid update %j and keeps the stored profile", async (override) => {
    await request(app).put("/api/profile").send(valid).expect(200);
    const res = await request(app).put("/api/profile").send({ ...valid, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await request(app).get("/api/profile")).body.goal).toBe("more_protein");
  });

  it("ignores health fields such as medications and weight", async () => {
    const res = await request(app)
      .put("/api/profile")
      .send({ ...valid, medications: ["metformin"], weightKg: 80, age: 40, conditions: ["diabetes"] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["avoidFoods", "dailyCalorieTarget", "dietPreferences", "goal", "updatedAt"]);
    const raw = JSON.stringify(await prisma.nutritionProfile.findFirst());
    expect(raw).not.toMatch(/metformin|diabetes|weightKg/);
  });
});
