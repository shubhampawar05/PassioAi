import { Router } from "express";
import type { FoodLogEntry, PrismaClient } from "../generated/prisma/client.js";
import { AppError, validationError } from "../errors.js";
import { dayWindow } from "../lib/dayWindow.js";
import { scaleNutrients, summarize, type Nutrients } from "../lib/nutrition.js";
import { createEntrySchema, dayQuerySchema, idParamSchema, updateEntrySchema } from "./schemas.js";

type Dec = { toNumber(): number } | null;
const num = (d: Dec): number | null => (d === null ? null : d.toNumber());

function perServingOf(e: FoodLogEntry): Nutrients {
  return {
    calories: num(e.caloriesPerServing),
    proteinG: num(e.proteinGPerServing),
    carbohydratesG: num(e.carbohydratesGPerServing),
    fatG: num(e.fatGPerServing),
  };
}

function totalsOf(e: FoodLogEntry): Nutrients {
  return { calories: num(e.calories), proteinG: num(e.proteinG), carbohydratesG: num(e.carbohydratesG), fatG: num(e.fatG) };
}

export function serializeEntry(e: FoodLogEntry) {
  return {
    id: e.id,
    loggedAt: e.loggedAt.toISOString(),
    inputType: e.inputType,
    inputSummary: e.inputSummary,
    foodName: e.foodName,
    servingUnit: e.servingUnit,
    servingWeightG: num(e.servingWeightG),
    quantity: e.servingQuantity.toNumber(),
    perServing: perServingOf(e),
    totals: totalsOf(e),
    provider: e.provider,
    providerRef: e.passioRef,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function totalsColumns(n: Nutrients) {
  return { calories: n.calories, proteinG: n.proteinG, carbohydratesG: n.carbohydratesG, fatG: n.fatG };
}

/** Keeps the small normalized provider excerpt for debugging; drops it if unexpectedly large. */
function minimizedPayload(details: Record<string, unknown> | undefined) {
  if (!details) return undefined;
  const json = JSON.stringify(details);
  return json.length <= 4000 ? (JSON.parse(json) as Record<string, string>) : undefined;
}

export function foodLogRouter(prisma: PrismaClient, demoUserId: string): Router {
  const router = Router();

  const parseDay = (query: unknown) => {
    const q = dayQuerySchema.safeParse(query);
    if (!q.success) throw validationError(q.error);
    return { ...q.data, ...dayWindow(q.data.date, q.data.tz) };
  };

  const parseId = (params: unknown) => {
    const p = idParamSchema.safeParse(params);
    if (!p.success) throw validationError(p.error);
    return p.data.id;
  };

  const findOwned = async (id: string) => {
    const entry = await prisma.foodLogEntry.findFirst({ where: { id, demoUserId } });
    if (!entry) throw new AppError("NOT_FOUND", "Food log entry not found");
    return entry;
  };

  const entriesForDay = (start: Date, end: Date) =>
    prisma.foodLogEntry.findMany({
      where: { demoUserId, loggedAt: { gte: start, lt: end } },
      orderBy: [{ loggedAt: "desc" }, { createdAt: "desc" }],
    });

  router.get("/food-logs", async (req, res) => {
    const day = parseDay(req.query);
    const entries = await entriesForDay(day.start, day.end);
    res.json({ date: day.date, tz: day.tz, entries: entries.map(serializeEntry) });
  });

  router.post("/food-logs", async (req, res) => {
    const parsed = createEntrySchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const input = parsed.data;
    const totals = scaleNutrients(input.perServing, input.quantity);
    const entry = await prisma.foodLogEntry.create({
      data: {
        demoUserId,
        loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
        inputType: input.inputType,
        inputSummary: input.inputSummary,
        foodName: input.foodName,
        servingUnit: input.servingUnit,
        servingWeightG: input.servingWeightG,
        servingQuantity: input.quantity,
        caloriesPerServing: input.perServing.calories,
        proteinGPerServing: input.perServing.proteinG,
        carbohydratesGPerServing: input.perServing.carbohydratesG,
        fatGPerServing: input.perServing.fatG,
        ...totalsColumns(totals),
        provider: input.provider,
        passioRef: input.providerRef,
        providerPayload: minimizedPayload(input.providerDetails),
      },
    });
    res.status(201).json(serializeEntry(entry));
  });

  router.get("/food-logs/:id", async (req, res) => {
    const entry = await findOwned(parseId(req.params));
    res.json(serializeEntry(entry));
  });

  router.patch("/food-logs/:id", async (req, res) => {
    const id = parseId(req.params);
    const parsed = updateEntrySchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const existing = await findOwned(id);
    // Recompute from stored per-serving values; Passio is not called again.
    const totals = scaleNutrients(perServingOf(existing), parsed.data.quantity);
    const updated = await prisma.foodLogEntry.update({
      where: { id },
      data: { servingQuantity: parsed.data.quantity, ...totalsColumns(totals) },
    });
    res.json(serializeEntry(updated));
  });

  router.delete("/food-logs/:id", async (req, res) => {
    const id = parseId(req.params);
    await findOwned(id);
    await prisma.foodLogEntry.delete({ where: { id } });
    res.status(204).end();
  });

  router.get("/nutrition-summary", async (req, res) => {
    const day = parseDay(req.query);
    const entries = await entriesForDay(day.start, day.end);
    res.json({
      date: day.date,
      tz: day.tz,
      window: { start: day.start.toISOString(), end: day.end.toISOString() },
      ...summarize(entries.map(totalsOf)),
    });
  });

  return router;
}
