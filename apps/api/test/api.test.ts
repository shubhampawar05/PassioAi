import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createPrisma } from "../src/db/prisma.js";
import { AppError } from "../src/errors.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { FoodRecognitionProvider, RecognitionResult } from "../src/recognition/types.js";

const prisma = createPrisma(process.env.TEST_DATABASE_URL!);
const USER = "test-user";

const okResult: RecognitionResult = {
  source: "passio",
  requestId: "req-1",
  candidates: [
    {
      name: "Apple",
      providerRef: "ref-apple",
      servings: [{ label: "1 medium (182 g)", weightG: 182, defaultQuantity: 1, nutrients: { calories: 95, proteinG: 0.5, carbohydratesG: 25, fatG: null } }],
      providerDetails: {},
    },
  ],
};

const fakeProvider = {
  mode: "passio" as const,
  recognizeImage: vi.fn(async () => okResult),
  recognizeText: vi.fn(async () => okResult),
  lookupBarcode: vi.fn(async () => okResult),
} satisfies FoodRecognitionProvider;

const app = createApp({ prisma, provider: fakeProvider, demoUserId: USER });

const entry = (overrides: Record<string, unknown> = {}) => ({
  inputType: "text",
  inputSummary: "an apple",
  foodName: "Apple",
  servingUnit: "1 medium (182 g)",
  servingWeightG: 182,
  quantity: 1,
  perServing: { calories: 100, proteinG: 10, carbohydratesG: 20, fatG: null },
  provider: "passio",
  providerRef: "ref-apple",
  ...overrides,
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

beforeEach(async () => {
  await prisma.foodLogEntry.deleteMany({});
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.foodLogEntry.deleteMany({});
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("reports ok with database reachable and the provider mode", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "ok", recognitionProvider: "passio" });
    expect(JSON.stringify(res.body)).not.toMatch(/key/i);
  });

  it("reports degraded with 503 when the database fails", async () => {
    const broken = { $queryRaw: () => Promise.reject(new Error("down")) } as unknown as PrismaClient;
    const res = await request(createApp({ prisma: broken, provider: fakeProvider, demoUserId: USER })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "error" });
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});

describe("POST /api/food-recognition", () => {
  it("recognizes text and returns candidates with an input summary", async () => {
    const res = await request(app).post("/api/food-recognition").send({ inputType: "text", text: "  an apple  " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "passio", inputType: "text", inputSummary: "an apple", candidates: [{ name: "Apple" }] });
    expect(fakeProvider.recognizeText).toHaveBeenCalledWith("an apple");
  });

  it("accepts voice transcripts through the text flow", async () => {
    const res = await request(app).post("/api/food-recognition").send({ inputType: "voice", text: "a banana" });
    expect(res.status).toBe(200);
    expect(res.body.inputType).toBe("voice");
    expect(fakeProvider.recognizeText).toHaveBeenCalledWith("a banana");
  });

  it("looks up barcodes", async () => {
    const res = await request(app).post("/api/food-recognition").send({ inputType: "barcode", barcode: "012345678905" });
    expect(res.status).toBe(200);
    expect(res.body.inputSummary).toBe("barcode 012345678905");
    expect(fakeProvider.lookupBarcode).toHaveBeenCalledWith("012345678905");
  });

  it("accepts a JPEG photo upload and does not echo image data", async () => {
    const res = await request(app).post("/api/food-recognition").attach("image", JPEG, { filename: "meal.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(res.body.inputSummary).toBe("photo (image/jpeg, 1 KB)");
    expect(fakeProvider.recognizeImage).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg");
  });

  it.each([
    [{ inputType: "text", text: "" }],
    [{ inputType: "text", text: "x".repeat(501) }],
    [{ inputType: "barcode", barcode: "12ab" }],
    [{ inputType: "smell" }],
    [{}],
  ])("rejects invalid JSON input %j", async (body) => {
    const res = await request(app).post("/api/food-recognition").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(fakeProvider.recognizeText).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types without calling Passio", async () => {
    const res = await request(app)
      .post("/api/food-recognition")
      .attach("image", Buffer.from("%PDF-1.7"), { filename: "doc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA");
    expect(fakeProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it("rejects files whose bytes are not an image even if labeled image/jpeg", async () => {
    const res = await request(app)
      .post("/api/food-recognition")
      .attach("image", Buffer.from("not really a jpeg"), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA");
  });

  it("rejects files over 8 MB", async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]);
    const res = await request(app).post("/api/food-recognition").attach("image", big, { filename: "big.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it.each([
    ["PROVIDER_TIMEOUT", 504],
    ["PROVIDER_QUOTA", 429],
    ["PROVIDER_BAD_RESPONSE", 502],
    ["PROVIDER_AUTH", 502],
    ["PROVIDER_NOT_CONFIGURED", 503],
  ] as const)("returns %s as HTTP %i with no fabricated result", async (code, status) => {
    fakeProvider.recognizeText.mockRejectedValueOnce(new AppError(code, "provider failed"));
    const res = await request(app).post("/api/food-recognition").send({ inputType: "text", text: "apple" });
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: "provider failed" } });
  });
});

describe("food logs", () => {
  it("creates an entry with server-computed totals, ignoring client totals", async () => {
    const res = await request(app)
      .post("/api/food-logs")
      .send({ ...entry({ quantity: 2 }), calories: 9999, totals: { calories: 9999 } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      foodName: "Apple",
      quantity: 2,
      perServing: { calories: 100, proteinG: 10, carbohydratesG: 20, fatG: null },
      totals: { calories: 200, proteinG: 20, carbohydratesG: 40, fatG: null },
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = await prisma.foodLogEntry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.calories?.toNumber()).toBe(200);
    expect(row.fatG).toBeNull();
    expect(row.demoUserId).toBe(USER);
  });

  it.each([
    [{ foodName: "" }],
    [{ quantity: 0 }],
    [{ quantity: -1 }],
    [{ perServing: { calories: -5, proteinG: null, carbohydratesG: null, fatG: null } }],
    [{ inputType: "telepathy" }],
    [{ provider: "other" }],
  ])("rejects invalid entry %j", async (override) => {
    const res = await request(app).post("/api/food-logs").send(entry(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.foodLogEntry.count()).toBe(0);
  });

  it("lists entries for a day newest first and retrieves one", async () => {
    for (const [name, at] of [
      ["Breakfast", "2026-10-28T12:00:00Z"],
      ["Dinner", "2026-10-29T01:00:00Z"],
      ["Lunch", "2026-10-28T17:00:00Z"],
      ["Tomorrow", "2026-10-29T12:00:00Z"],
    ] as const) {
      await request(app).post("/api/food-logs").send(entry({ foodName: name, loggedAt: at })).expect(201);
    }
    const list = await request(app).get("/api/food-logs").query({ date: "2026-10-28", tz: "America/New_York" });
    expect(list.status).toBe(200);
    expect(list.body.entries.map((e: { foodName: string }) => e.foodName)).toEqual(["Dinner", "Lunch", "Breakfast"]);

    const one = await request(app).get(`/api/food-logs/${list.body.entries[0].id}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ foodName: "Dinner", providerRef: "ref-apple" });
  });

  it("validates list query parameters", async () => {
    expect((await request(app).get("/api/food-logs").query({ date: "2026-13-40" })).status).toBe(400);
    expect((await request(app).get("/api/food-logs").query({ date: "2026-10-28", tz: "Not/AZone" })).status).toBe(400);
    expect((await request(app).get("/api/food-logs")).status).toBe(400);
  });

  it("returns 404 for unknown ids and 400 for malformed ids", async () => {
    const missing = await request(app).get("/api/food-logs/7f1e0e8c-5c1a-4c9e-9a51-2b2f1f0c0a11");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await request(app).get("/api/food-logs/not-a-uuid")).status).toBe(400);
  });

  it("does not expose entries of another demo user", async () => {
    const other = createApp({ prisma, provider: fakeProvider, demoUserId: "someone-else" });
    const created = await request(other).post("/api/food-logs").send(entry()).expect(201);
    expect((await request(app).get(`/api/food-logs/${created.body.id}`)).status).toBe(404);
  });

  it("edits quantity and recomputes totals from stored per-serving values", async () => {
    const created = await request(app).post("/api/food-logs").send(entry()).expect(201);
    const res = await request(app).patch(`/api/food-logs/${created.body.id}`).send({ quantity: 1.5, perServing: { calories: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ calories: 150, proteinG: 15, carbohydratesG: 30, fatG: null });
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.body.updatedAt).getTime());
    expect(fakeProvider.recognizeText).not.toHaveBeenCalled();
    expect((await request(app).patch(`/api/food-logs/${created.body.id}`).send({ quantity: 0 })).status).toBe(400);
  });

  it("deletes an entry", async () => {
    const created = await request(app).post("/api/food-logs").send(entry()).expect(201);
    expect((await request(app).delete(`/api/food-logs/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/food-logs/${created.body.id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/food-logs/${created.body.id}`)).status).toBe(404);
  });
});

describe("GET /api/nutrition-summary", () => {
  it("totals persisted entries, flags missing values, and reflects deletes", async () => {
    const day = { date: "2026-10-28", tz: "America/New_York" };
    const a = await request(app)
      .post("/api/food-logs")
      .send(entry({ loggedAt: "2026-10-28T14:00:00Z", perServing: { calories: 200, proteinG: 10, carbohydratesG: 30, fatG: 5 } }));
    const b = await request(app)
      .post("/api/food-logs")
      .send(entry({ loggedAt: "2026-10-29T03:30:00Z", perServing: { calories: 350, proteinG: 20, carbohydratesG: null, fatG: null } }));
    // Outside the local day (00:30 local on Oct 29).
    await request(app).post("/api/food-logs").send(entry({ loggedAt: "2026-10-29T04:30:00Z" }));

    let s = await request(app).get("/api/nutrition-summary").query(day);
    expect(s.status).toBe(200);
    expect(s.body.entryCount).toBe(2);
    expect(s.body.nutrients.calories).toEqual({ total: 550, contributingEntries: 2, missingEntries: 0 });
    expect(s.body.nutrients.fatG).toEqual({ total: 5, contributingEntries: 1, missingEntries: 1 });
    expect(s.body.window).toEqual({ start: "2026-10-28T04:00:00.000Z", end: "2026-10-29T04:00:00.000Z" });

    await request(app).delete(`/api/food-logs/${b.body.id}`).expect(204);
    s = await request(app).get("/api/nutrition-summary").query(day);
    expect(s.body.entryCount).toBe(1);
    expect(s.body.nutrients.calories.total).toBe(200);

    await request(app).patch(`/api/food-logs/${a.body.id}`).send({ quantity: 2 }).expect(200);
    s = await request(app).get("/api/nutrition-summary").query(day);
    expect(s.body.nutrients.calories.total).toBe(400);
  });

  it("returns zeros with no contributors on an empty day", async () => {
    const s = await request(app).get("/api/nutrition-summary").query({ date: "2026-01-01" });
    expect(s.body).toMatchObject({ entryCount: 0, tz: "UTC", nutrients: { calories: { total: 0, contributingEntries: 0 } } });
  });

  it("uses a 25-hour window on the DST fall-back day", async () => {
    await request(app).post("/api/food-logs").send(entry({ loggedAt: "2026-11-02T04:30:00Z" })).expect(201); // 23:30 EST Nov 1
    const s = await request(app).get("/api/nutrition-summary").query({ date: "2026-11-01", tz: "America/New_York" });
    expect(s.body.entryCount).toBe(1);
    expect(s.body.window).toEqual({ start: "2026-11-01T04:00:00.000Z", end: "2026-11-02T05:00:00.000Z" });
  });
});
