import type { Nutrients } from "../lib/nutrition.js";

export type ServingOption = {
  /** Human-readable label, e.g. "1 cup" or "100 g". */
  label: string;
  /** Gram weight of one serving, when the provider returned it. */
  weightG: number | null;
  /** Suggested number of servings (Passio `suggestedQuantity[0]`), default 1. */
  defaultQuantity: number;
  /** Nutrients for ONE serving of this option. */
  nutrients: Nutrients;
};

export type FoodCandidate = {
  name: string;
  /** Passio refCode or product code, when returned. */
  providerRef: string | null;
  servings: ServingOption[];
  /** Small normalized excerpt of the provider data, for debugging only. */
  providerDetails: Record<string, unknown>;
};

export type RecognitionSource = "passio" | "mock";

export type RecognitionResult = {
  source: RecognitionSource;
  candidates: FoodCandidate[];
  /** Passio `X-Request-ID`, if returned. */
  requestId: string | null;
};

/** Boundary for food-recognition backends so routes can be tested without vendor calls. */
export interface FoodRecognitionProvider {
  readonly mode: "passio" | "mock" | "unconfigured";
  recognizeImage(image: Buffer, mimeType: string): Promise<RecognitionResult>;
  /** Packaged product from a photo of its Nutrition Facts label. */
  recognizeLabel(image: Buffer, mimeType: string): Promise<RecognitionResult>;
  recognizeText(text: string): Promise<RecognitionResult>;
  lookupBarcode(code: string): Promise<RecognitionResult>;
}
