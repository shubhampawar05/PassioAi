import type { NutritionGuidanceProvider } from "../advisor/guidanceProvider.js";
import { AppError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { minimizePlanPayload } from "./plan.js";

/**
 * In-process background generation for full meal plans (single-instance POC).
 * Status lives in the database, so clients poll GET /api/meal-plans/:id.
 */
export class MealPlanJobs {
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly guidance: NutritionGuidanceProvider,
  ) {}

  start(planId: string): void {
    if (this.running.has(planId)) return;
    const job = this.run(planId).finally(() => this.running.delete(planId));
    this.running.set(planId, job);
  }

  /** Resolves when all in-flight jobs have settled (used by tests and shutdown). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.running.values()]);
  }

  private async run(planId: string): Promise<void> {
    try {
      const plan = await this.prisma.mealPlan.findUniqueOrThrow({ where: { id: planId } });
      const result = await this.guidance.generateMealPlan(JSON.stringify(plan.previewPayload));
      await this.prisma.mealPlan.update({
        where: { id: planId },
        data: { status: "ready", planPayload: minimizePlanPayload(result.plan.passio) as object, errorCode: null },
      });
      console.info(`[meal-plans] ${planId} ready`);
    } catch (err) {
      const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
      console.warn(`[meal-plans] ${planId} failed: ${code}`);
      await this.prisma.mealPlan
        .update({ where: { id: planId }, data: { status: "failed", errorCode: code } })
        .catch(() => undefined); // plan may have been deleted meanwhile
    }
  }
}

/** On startup, plans left `generating` by a previous process can never finish. */
export async function recoverInterruptedPlans(prisma: PrismaClient): Promise<number> {
  const res = await prisma.mealPlan.updateMany({ where: { status: "generating" }, data: { status: "failed", errorCode: "INTERRUPTED" } });
  return res.count;
}
