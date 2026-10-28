import express from "express";
import { errorHandler, notFoundHandler } from "./errors.js";
import { foodLogRouter } from "./foodLogs/routes.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { healthRouter } from "./health/routes.js";
import { recognitionRouter } from "./recognition/routes.js";
import type { FoodRecognitionProvider } from "./recognition/types.js";

export type AppDeps = {
  prisma: PrismaClient;
  provider: FoodRecognitionProvider;
  demoUserId: string;
};

export function createApp({ prisma, provider, demoUserId }: AppDeps) {
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
  api.use(notFoundHandler);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
