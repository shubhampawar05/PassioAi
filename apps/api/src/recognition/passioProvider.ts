import { AppError } from "../errors.js";
import { normalizeExtractItem, normalizePassioFood } from "./normalize.js";
import { PassioClient, type PassioClientOptions } from "./passioClient.js";
import {
  ingredientExtractResponseSchema,
  mealLogResponseSchema,
  passioFoodSchema,
  type IngredientExtractItem,
} from "./passioSchemas.js";
import type { FoodRecognitionProvider, RecognitionResult } from "./types.js";

/** Documented routes (base https://api.passiolife.com/v2). */
const ROUTES = {
  image: "/products/napi/tools/vision/extractIngredientsAutoTyped",
  // Meal-log route: in live testing extractIngredients returned HTTP 500 for
  // multi-food sentences that this route handled.
  text: "/products/napi/tools/extractMealLogAction",
  barcode: (code: string) => `/products/napi/food/productCode/${encodeURIComponent(code)}`,
};

export class PassioProvider implements FoodRecognitionProvider {
  readonly mode = "passio" as const;
  private readonly client: PassioClient;

  constructor(options: PassioClientOptions) {
    this.client = new PassioClient(options);
  }

  async recognizeImage(image: Buffer, mimeType: string): Promise<RecognitionResult> {
    const res = await this.client.request("POST", ROUTES.image, {
      json: { image: `data:${mimeType};base64,${image.toString("base64")}` },
      logLabel: "vision.extractIngredientsAutoTyped",
    });
    return this.parseExtract(res.status, res.body, res.requestId);
  }

  async recognizeText(text: string): Promise<RecognitionResult> {
    const res = await this.client.request("POST", ROUTES.text, {
      json: { content: text },
      logLabel: "tools.extractMealLogAction",
    });
    if (res.status === 404) return { source: "passio", candidates: [], requestId: res.requestId };
    const parsed = mealLogResponseSchema.safeParse(res.body ?? []);
    if (!parsed.success) {
      throw new AppError("PROVIDER_BAD_RESPONSE", "Passio meal-log response was not in the documented format");
    }
    const items = parsed.data.flatMap((el) =>
      "items" in el && Array.isArray(el.items) ? (el.action === "remove" ? [] : el.items) : [el as IngredientExtractItem],
    );
    return { source: "passio", candidates: items.map(normalizeExtractItem), requestId: res.requestId };
  }

  async lookupBarcode(code: string): Promise<RecognitionResult> {
    const res = await this.client.request("GET", ROUTES.barcode(code), {
      timeoutMs: 15_000,
      logLabel: "food.productCode",
    });
    if (res.status === 404) return { source: "passio", candidates: [], requestId: res.requestId };
    const parsed = passioFoodSchema.safeParse(res.body);
    if (!parsed.success) {
      throw new AppError("PROVIDER_BAD_RESPONSE", "Passio barcode response was not in the documented format");
    }
    return { source: "passio", candidates: [normalizePassioFood(parsed.data, code)], requestId: res.requestId };
  }

  private parseExtract(status: number, body: unknown, requestId: string | null): RecognitionResult {
    if (status === 404) return { source: "passio", candidates: [], requestId };
    const parsed = ingredientExtractResponseSchema.safeParse(body ?? []);
    if (!parsed.success) {
      throw new AppError("PROVIDER_BAD_RESPONSE", "Passio recognition response was not in the documented format");
    }
    return { source: "passio", candidates: parsed.data.map(normalizeExtractItem), requestId };
  }
}
