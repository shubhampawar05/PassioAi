import { z } from "zod";
import { AppError } from "../errors.js";
import { PassioClient } from "../recognition/passioClient.js";
import type { RecognitionSource } from "../recognition/types.js";
import { humanizedListSchema, parsePlanPayload, type RawPlan } from "../mealPlans/plan.js";

/**
 * Boundary for Passio's guidance routes (nutrition advisor; meal plans later).
 * Separate from FoodRecognitionProvider so recognition tests stay focused; both
 * are built from one PassioClient by the factory.
 */

export type AdvisorAnswer = { answer: string; source: RecognitionSource; requestId: string | null };
export type PlanResult = { plan: RawPlan; source: RecognitionSource; requestId: string | null };
export type HumanizedItem = { name: string; shoppingName: string | null; quantity: number | null; unit: string | null; notes: string | null };

/** Full plans took 14 s for 2 days live; docs say 1.5–6 min. */
export const FULL_PLAN_TIMEOUT_MS = 480_000;

export interface NutritionGuidanceProvider {
  readonly mode: "passio" | "mock" | "unconfigured";
  /** `content` is the user's question; `context` goes in Passio's free-text `message`. */
  askAdvisor(content: string, context: string): Promise<AdvisorAnswer>;
  /** `content`: prompt text for a new plan, or JSON.stringify(preview) to regenerate rejected meals. */
  previewMealPlan(content: string): Promise<PlanResult>;
  /** `content`: JSON.stringify(approved preview). */
  generateMealPlan(content: string): Promise<PlanResult>;
  /** `content`: one "name, quantity, unit" line per item. */
  humanizeShoppingList(content: string): Promise<HumanizedItem[]>;
}

/** POST /napi/tools/nutritionAdvisor → NutritionAdvisorResponse { answer } (verified live 2026-10-28). */
const advisorResponseSchema = z.looseObject({ answer: z.string().min(1) });

export class PassioGuidanceProvider implements NutritionGuidanceProvider {
  readonly mode = "passio" as const;
  constructor(private readonly client: PassioClient) {}

  async askAdvisor(content: string, context: string): Promise<AdvisorAnswer> {
    const res = await this.client.request("POST", "/products/napi/tools/nutritionAdvisor", {
      json: { content, message: context },
      logLabel: "tools.nutritionAdvisor",
    });
    const parsed = advisorResponseSchema.safeParse(res.body);
    if (res.status === 404 || !parsed.success) {
      throw new AppError("PROVIDER_BAD_RESPONSE", "Passio advisor response was not in the documented format");
    }
    return { answer: parsed.data.answer, source: "passio", requestId: res.requestId };
  }

  async previewMealPlan(content: string): Promise<PlanResult> {
    const res = await this.client.request("POST", "/products/napi/tools/generateMealPlanPreview", {
      json: { content },
      logLabel: "tools.generateMealPlanPreview",
    });
    return { plan: parsePlanPayload(res.body), source: "passio", requestId: res.requestId };
  }

  async generateMealPlan(content: string): Promise<PlanResult> {
    const res = await this.client.request("POST", "/products/napi/tools/generateMealPlan", {
      json: { content },
      timeoutMs: FULL_PLAN_TIMEOUT_MS,
      logLabel: "tools.generateMealPlan",
    });
    return { plan: parsePlanPayload(res.body), source: "passio", requestId: res.requestId };
  }

  async humanizeShoppingList(content: string): Promise<HumanizedItem[]> {
    const res = await this.client.request("POST", "/products/napi/tools/humanizeShoppingList", {
      json: { content },
      logLabel: "tools.humanizeShoppingList",
    });
    const parsed = humanizedListSchema.safeParse(res.body);
    if (!parsed.success) throw new AppError("PROVIDER_BAD_RESPONSE", "Passio shopping-list response was not in the expected format");
    return parsed.data.items.map((i) => ({
      name: i.name,
      shoppingName: i.shoppingName ?? null,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      notes: i.notes ?? null,
    }));
  }
}

const mockRecipe = (name: string, calories: number, protein: number) => ({
  name: `[MOCK] ${name}`,
  rejected: false,
  ingredients: [],
  preparation: "Development mock data, not from Passio.",
  macros: { calories, protein, carbs: 30, fat: null as number | null, fiber: 5 },
});

function mockPlanBody(days: number, full: boolean, rejected: Set<string> = new Set()) {
  const slot = (d: number, s: string, name: string, cal: number) => {
    const n = rejected.has(`${d}:${s}`) ? `${name} (regenerated)` : name;
    return { recipes: [full ? mockRecipe(n, cal, 20) : { name: `[MOCK] ${n}`, rejected: false }] };
  };
  return {
    constraints: { mock: true },
    mealPlanDays: Array.from({ length: days }, (_, i) => ({
      breakfast: slot(i + 1, "breakfast", "Oat bowl", 350),
      lunch: slot(i + 1, "lunch", "Bean salad", 500),
      dinner: slot(i + 1, "dinner", "Veggie curry", 600),
      ...(full ? { macros: { calories: 1450, protein: 60, carbs: 90, fat: null, fiber: 15 } } : {}),
    })),
    ...(full ? { shoppingList: [{ name: "[MOCK] Rolled oats", portionQuantity: 1, portionSize: "cup" }] } : {}),
  };
}

/** Rejected meals in a preview sent back as JSON, as "day:slot" keys. */
function rejectedKeys(content: string): { days: number; rejected: Set<string> } | null {
  try {
    const parsed = parsePlanPayload(JSON.parse(content));
    const rejected = new Set<string>();
    parsed.days.forEach((d, i) => {
      for (const [slot, recipes] of Object.entries(d.slots)) if (recipes.some((r) => r.rejected)) rejected.add(`${i + 1}:${slot}`);
    });
    return { days: parsed.days.length, rejected };
  } catch {
    return null;
  }
}

export class MockGuidanceProvider implements NutritionGuidanceProvider {
  readonly mode = "mock" as const;
  async askAdvisor(content: string): Promise<AdvisorAnswer> {
    return {
      answer: `**[MOCK]** This is development mock data, not Passio output. You asked: "${content.slice(0, 80)}". A real answer would come from Passio's nutrition advisor.`,
      source: "mock",
      requestId: null,
    };
  }

  async previewMealPlan(content: string): Promise<PlanResult> {
    const regen = rejectedKeys(content);
    const days = regen?.days ?? Math.min(7, Math.max(1, Number(/(\d+) day/.exec(content)?.[1] ?? 3)));
    return { plan: parsePlanPayload(mockPlanBody(days, false, regen?.rejected)), source: "mock", requestId: null };
  }

  async generateMealPlan(content: string): Promise<PlanResult> {
    const days = rejectedKeys(content)?.days ?? 1;
    return { plan: parsePlanPayload(mockPlanBody(days, true)), source: "mock", requestId: null };
  }

  async humanizeShoppingList(content: string): Promise<HumanizedItem[]> {
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ name: line.split(",")[0]!.trim(), shoppingName: `[MOCK] ${line.split(",")[0]!.trim()}`, quantity: 1, unit: "pack", notes: null }));
  }
}

export class UnconfiguredGuidanceProvider implements NutritionGuidanceProvider {
  readonly mode = "unconfigured" as const;
  private fail(): never {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Passio is not configured. Set PASSIO_API_KEY (or PASSIO_MODE=mock for labeled mock data).",
    );
  }
  async askAdvisor(): Promise<never> {
    this.fail();
  }
  async previewMealPlan(): Promise<never> {
    this.fail();
  }
  async generateMealPlan(): Promise<never> {
    this.fail();
  }
  async humanizeShoppingList(): Promise<never> {
    this.fail();
  }
}
