import express from "express";
import { advisorRouter } from "./advisor/routes.js";
import { UnconfiguredGuidanceProvider, type NutritionGuidanceProvider } from "./advisor/guidanceProvider.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { foodLogRouter } from "./foodLogs/routes.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { healthRouter } from "./health/routes.js";
import { MealPlanJobs } from "./mealPlans/jobs.js";
import { mealPlanRouter } from "./mealPlans/routes.js";
import { profileRouter } from "./profile/profile.js";
import { recognitionRouter } from "./recognition/routes.js";
import type { FoodRecognitionProvider } from "./recognition/types.js";

export type AppDeps = {
  prisma: PrismaClient;
  provider: FoodRecognitionProvider;
  /** Advisor (and later meal plans); defaults to unconfigured so tests opt in explicitly. */
  guidance?: NutritionGuidanceProvider;
  demoUserId: string;
};

export function createApp({ prisma, provider, guidance = new UnconfiguredGuidanceProvider(), demoUserId }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "100kb" }));

  // Request log without bodies, query strings, or headers.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      console.info(`[api] ${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  const api = express.Router();
  api.use(healthRouter(prisma, provider));
  api.use(recognitionRouter(provider));
  api.use(foodLogRouter(prisma, demoUserId));
  api.use(profileRouter(prisma, demoUserId));
  api.use(advisorRouter(prisma, guidance, demoUserId));
  const mealPlanJobs = new MealPlanJobs(prisma, guidance);
  app.locals.mealPlanJobs = mealPlanJobs;
  api.use(mealPlanRouter(prisma, guidance, mealPlanJobs, demoUserId));
  api.use(notFoundHandler);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
