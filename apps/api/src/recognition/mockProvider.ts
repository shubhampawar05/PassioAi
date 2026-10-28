import type { FoodCandidate, FoodRecognitionProvider, RecognitionResult } from "./types.js";

/**
 * Opt-in development mock (PASSIO_MODE=mock). Results are tagged `source: "mock"`
 * and the UI shows a MOCK DATA banner. Values are illustrative placeholders, not
 * Passio data, and must never be presented as real recognition output.
 */
const MOCK_FOODS: FoodCandidate[] = [
  {
    name: "[MOCK] Scrambled eggs",
    providerRef: "mock-eggs",
    servings: [
      {
        label: "1 cup (220 g)",
        weightG: 220,
        defaultQuantity: 1,
        nutrients: { calories: 330, proteinG: 22, carbohydratesG: 4.4, fatG: 24.2 },
      },
    ],
    providerDetails: { mock: true },
  },
  {
    name: "[MOCK] Whole wheat toast",
    providerRef: "mock-toast",
    servings: [
      {
        label: "1 slice (32 g)",
        weightG: 32,
        defaultQuantity: 1,
        nutrients: { calories: 80, proteinG: 4, carbohydratesG: 14, fatG: null },
      },
    ],
    providerDetails: { mock: true },
  },
];

export class MockProvider implements FoodRecognitionProvider {
  readonly mode = "mock" as const;

  private result(candidates: FoodCandidate[]): RecognitionResult {
    return { source: "mock", candidates: structuredClone(candidates), requestId: null };
  }

  async recognizeImage(): Promise<RecognitionResult> {
    return this.result(MOCK_FOODS);
  }

  async recognizeLabel(): Promise<RecognitionResult> {
    return this.result([
      {
        name: "[MOCK] Packaged peanut butter",
        providerRef: null,
        servings: [
          {
            label: "tbsp (16 g)",
            weightG: 16,
            defaultQuantity: 2,
            nutrients: { calories: 95, proteinG: 4, carbohydratesG: 3.5, fatG: 8 },
          },
        ],
        providerDetails: { mock: true, ingredientsText: "[MOCK] roasted peanuts; salt" },
      },
    ]);
  }

  async recognizeText(text: string): Promise<RecognitionResult> {
    if (/no ?match/i.test(text)) return this.result([]);
    return this.result(MOCK_FOODS);
  }

  async lookupBarcode(code: string): Promise<RecognitionResult> {
    if (code === "000000000000") return this.result([]);
    return this.result([{ ...MOCK_FOODS[1]!, name: `[MOCK] Packaged product ${code}`, providerRef: code }]);
  }
}
