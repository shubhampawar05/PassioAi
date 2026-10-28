import { Router } from "express";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { FoodRecognitionProvider } from "../recognition/types.js";

const DB_CHECK_TIMEOUT_MS = 3000;

export function healthRouter(prisma: PrismaClient, provider: FoodRecognitionProvider): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    let database: "ok" | "error" = "ok";
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_CHECK_TIMEOUT_MS).unref()),
      ]);
    } catch {
      database = "error";
    }
    const ok = database === "ok";
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      database,
      // Reports the mode only, never credentials.
      recognitionProvider: provider.mode,
      time: new Date().toISOString(),
    });
  });

  return router;
}
