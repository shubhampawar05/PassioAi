import { Router } from "express";
import { z } from "zod";
import type { NutritionGuidanceProvider } from "../advisor/guidanceProvider.js";
import { AppError, validationError } from "../errors.js";
import { serializeEntry } from "../foodLogs/routes.js";
import type { MealPlan, PrismaClient } from "../generated/prisma/client.js";
import { scaleNutrients } from "../lib/nutrition.js";
import { getProfile } from "../profile/profile.js";
import { buildMealPlanContent } from "./content.js";
import type { MealPlanJobs } from "./jobs.js";
import { applyRejections, daysView, findRecipe, macrosView, parsePlanPayload, titleCase } from "./plan.js";

const createSchema = z.object({
  days: z.number().int().min(1).max(7).default(3),
  notes: z.string().trim().max(300).nullish(),
});

const target = z.object({ day: z.number().int().min(1).max(7), slot: z.string().min(1).max(30), index: z.number().int().min(0).max(20) });
const regenerateSchema = z.object({ rejected: z.array(target).min(1).max(28) });

const idSchema = z.object({ id: z.uuid() });

function planView(row: MealPlan) {
  const source = row.status === "ready" && row.planPayload ? row.planPayload : row.previewPayload;
  const plan = parsePlanPayload(source);
  return {
    id: row.id,
    status: row.status,
    dayCount: row.days,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorCode: row.errorCode,
    constraints: plan.constraints,
    days: daysView(plan),
    shoppingList: row.status === "ready" ? plan.shoppingList : [],
    shoppingListHumanized: row.shoppingListHumanized ?? null,
  };
}

export function mealPlanRouter(prisma: PrismaClient, guidance: NutritionGuidanceProvider, jobs: MealPlanJobs, demoUserId: string): Router {
  const router = Router();
  const source = guidance.mode === "mock" ? "mock" : "passio";
  const view = (row: MealPlan) => ({ ...planView(row), source });

  const findOwned = async (params: unknown) => {
    const p = idSchema.safeParse(params);
    if (!p.success) throw validationError(p.error);
    const row = await prisma.mealPlan.findFirst({ where: { id: p.data.id, demoUserId } });
    if (!row) throw new AppError("NOT_FOUND", "Meal plan not found");
    return row;
  };

  const requireStatus = (row: MealPlan, allowed: MealPlan["status"][]) => {
    if (!allowed.includes(row.status)) {
      throw new AppError("INVALID_STATE", `Meal plan is ${row.status}; this action needs ${allowed.join(" or ")}`);
    }
  };

  router.post("/meal-plans", async (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const notes = parsed.data.notes || null;
    const profile = await getProfile(prisma, demoUserId);
    const content = buildMealPlanContent(profile, parsed.data.days, notes); // scope guard on notes
    const result = await guidance.previewMealPlan(content);
    const row = await prisma.mealPlan.create({
      data: {
        demoUserId,
        days: result.plan.days.length,
        notes,
        profileSnapshot: profile,
        previewPayload: result.plan.passio as object,
      },
    });
    res.status(201).json(view(row));
  });

  router.get("/meal-plans", async (_req, res) => {
    const rows = await prisma.mealPlan.findMany({ where: { demoUserId }, orderBy: { createdAt: "desc" }, take: 50 });
    res.json({
      plans: rows.map((r) => ({ id: r.id, status: r.status, dayCount: r.days, notes: r.notes, errorCode: r.errorCode, createdAt: r.createdAt.toISOString() })),
    });
  });

  router.get("/meal-plans/:id", async (req, res) => {
    res.json(view(await findOwned(req.params)));
  });

  router.delete("/meal-plans/:id", async (req, res) => {
    const row = await findOwned(req.params);
    // Logged food entries are independent rows and are kept.
    await prisma.mealPlan.delete({ where: { id: row.id } });
    res.status(204).end();
  });

  router.post("/meal-plans/:id/regenerate", async (req, res) => {
    const row = await findOwned(req.params);
    requireStatus(row, ["preview"]);
    const parsed = regenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const marked = applyRejections(row.previewPayload as Record<string, unknown>, parsed.data.rejected);
    const result = await guidance.previewMealPlan(JSON.stringify(marked));
    const updated = await prisma.mealPlan.update({
      where: { id: row.id },
      data: { previewPayload: result.plan.passio as object, days: result.plan.days.length },
    });
    res.json(view(updated));
  });

  router.post("/meal-plans/:id/approve", async (req, res) => {
    const row = await findOwned(req.params);
    requireStatus(row, ["preview", "failed"]);
    const updated = await prisma.mealPlan.update({ where: { id: row.id }, data: { status: "generating", errorCode: null } });
    jobs.start(row.id);
    res.status(202).json(view(updated));
  });

  router.post("/meal-plans/:id/shopping-list/humanize", async (req, res) => {
    const row = await findOwned(req.params);
    requireStatus(row, ["ready"]);
    const list = parsePlanPayload(row.planPayload).shoppingList;
    if (list.length === 0) throw new AppError("INVALID_STATE", "This plan has no shopping list");
    const content = list.map((i) => [i.name, i.portionQuantity ?? "", i.portionSize ?? ""].join(", ")).join("\n");
    const items = await guidance.humanizeShoppingList(content);
    const updated = await prisma.mealPlan.update({ where: { id: row.id }, data: { shoppingListHumanized: items } });
    res.json(view(updated));
  });

  router.post("/meal-plans/:id/log", async (req, res) => {
    const row = await findOwned(req.params);
    requireStatus(row, ["ready"]);
    const parsed = target.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const { day, slot, index } = parsed.data;
    const recipe = findRecipe(parsePlanPayload(row.planPayload), day, slot, index);
    if (!recipe) throw new AppError("NOT_FOUND", `No recipe at day ${day} ${slot} #${index}`);
    // Nutrients come only from the stored Passio recipe macros, never from the client.
    const m = macrosView(recipe.macros);
    const perServing = { calories: m?.calories ?? null, proteinG: m?.proteinG ?? null, carbohydratesG: m?.carbohydratesG ?? null, fatG: m?.fatG ?? null };
    const totals = scaleNutrients(perServing, 1);
    const entry = await prisma.foodLogEntry.create({
      data: {
        demoUserId,
        inputType: "meal_plan",
        inputSummary: `meal plan ${row.id.slice(0, 8)} day ${day} ${slot}`,
        foodName: titleCase(recipe.name).slice(0, 200),
        servingUnit: "1 recipe",
        servingQuantity: 1,
        caloriesPerServing: perServing.calories,
        proteinGPerServing: perServing.proteinG,
        carbohydratesGPerServing: perServing.carbohydratesG,
        fatGPerServing: perServing.fatG,
        calories: totals.calories,
        proteinG: totals.proteinG,
        carbohydratesG: totals.carbohydratesG,
        fatG: totals.fatG,
        provider: source,
        providerPayload: { mealPlanId: row.id, day, slot, index },
      },
    });
    res.status(201).json(serializeEntry(entry));
  });

  return router;
}
