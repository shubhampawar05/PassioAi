import { Router } from "express";
import { z } from "zod";
import { validationError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Demo nutrition profile. Intentionally non-medical: no age, sex, body
 * measurements, conditions, medications, or pregnancy. A weight-loss goal is
 * excluded pending product/clinical review.
 */

export const GOALS = {
  balanced: "Balanced, varied eating",
  more_protein: "Eat more protein",
  more_fiber: "Eat more fiber",
  more_vegetables: "Eat more vegetables",
  steady_energy: "Steady energy through the day",
} as const;

export const DIET_PREFERENCES = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  halal: "Halal",
  kosher: "Kosher",
} as const;

type Goal = keyof typeof GOALS;
type Diet = keyof typeof DIET_PREFERENCES;

const goalKeys = Object.keys(GOALS) as [Goal, ...Goal[]];
const dietKeys = Object.keys(DIET_PREFERENCES) as [Diet, ...Diet[]];

/** Unknown keys (e.g. medications, weightKg) are stripped, never stored. */
export const profileInputSchema = z.object({
  goal: z.enum(goalKeys),
  dailyCalorieTarget: z.number().int().min(1200).max(4000).nullable(),
  dietPreferences: z
    .array(z.enum(dietKeys))
    .max(5)
    .transform((v) => [...new Set(v)]),
  avoidFoods: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .transform((v) => [...new Set(v.map((s) => s.toLowerCase()))]),
});

export type Profile = z.infer<typeof profileInputSchema> & { updatedAt: string | null };

export const DEFAULT_PROFILE: Profile = {
  goal: "balanced",
  dailyCalorieTarget: null,
  dietPreferences: [],
  avoidFoods: [],
  updatedAt: null,
};

export async function getProfile(prisma: PrismaClient, demoUserId: string): Promise<Profile> {
  const row = await prisma.nutritionProfile.findUnique({ where: { demoUserId } });
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    goal: row.goal,
    dailyCalorieTarget: row.dailyCalorieTarget,
    dietPreferences: row.dietPreferences.filter((d): d is Diet => d in DIET_PREFERENCES),
    avoidFoods: row.avoidFoods,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function profileRouter(prisma: PrismaClient, demoUserId: string): Router {
  const router = Router();

  router.get("/profile", async (_req, res) => {
    res.json(await getProfile(prisma, demoUserId));
  });

  router.put("/profile", async (req, res) => {
    const parsed = profileInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const data = parsed.data;
    await prisma.nutritionProfile.upsert({
      where: { demoUserId },
      create: { demoUserId, ...data },
      update: data,
    });
    res.json(await getProfile(prisma, demoUserId));
  });

  return router;
}
