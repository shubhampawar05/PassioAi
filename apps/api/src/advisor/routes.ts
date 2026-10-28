import { Router } from "express";
import { z } from "zod";
import { AppError, validationError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { dayWindow, isValidTimeZone } from "../lib/dayWindow.js";
import { summarize } from "../lib/nutrition.js";
import { getProfile } from "../profile/profile.js";
import { buildAdvisorContext } from "./context.js";
import type { NutritionGuidanceProvider } from "./guidanceProvider.js";
import { isOutOfScope, OUT_OF_SCOPE_MESSAGE } from "./scopeGuard.js";

const askSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(8000) }))
    .max(3)
    .default([]),
  tz: z.string().default("UTC").refine(isValidTimeZone, "tz must be a valid IANA timezone"),
});

const dec = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

/** Today's calendar date (YYYY-MM-DD) in `tz`. */
export function localDate(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * POST /api/advisor. Questions and answers are never stored or logged (the
 * request log records only method, path, status, and duration).
 */
export function advisorRouter(prisma: PrismaClient, guidance: NutritionGuidanceProvider, demoUserId: string): Router {
  const router = Router();

  router.post("/advisor", async (req, res) => {
    const parsed = askSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    const { question, history, tz } = parsed.data;
    // Guard runs before any provider call.
    if (isOutOfScope(question)) throw new AppError("ADVISOR_OUT_OF_SCOPE", OUT_OF_SCOPE_MESSAGE);

    const date = localDate(tz);
    const { start, end } = dayWindow(date, tz);
    const [profile, rows] = await Promise.all([
      getProfile(prisma, demoUserId),
      prisma.foodLogEntry.findMany({
        where: { demoUserId, loggedAt: { gte: start, lt: end } },
        orderBy: { loggedAt: "asc" },
      }),
    ]);
    const totals = rows.map((r) => ({
      calories: dec(r.calories),
      proteinG: dec(r.proteinG),
      carbohydratesG: dec(r.carbohydratesG),
      fatG: dec(r.fatG),
    }));
    const context = buildAdvisorContext({
      profile,
      entries: rows.map((r, i) => ({ foodName: r.foodName, calories: totals[i]!.calories })),
      summary: summarize(totals),
      date,
      history,
    });
    res.json(await guidance.askAdvisor(question, context));
  });

  return router;
}
