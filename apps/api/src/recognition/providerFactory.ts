import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { MockProvider } from "./mockProvider.js";
import { PassioProvider } from "./passioProvider.js";
import type { FoodRecognitionProvider } from "./types.js";

/** Used when PASSIO_MODE=passio but no key is set. Fails loudly; never falls back to mock data. */
class UnconfiguredProvider implements FoodRecognitionProvider {
  readonly mode = "unconfigured" as const;
  private fail(): never {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Passio is not configured. Set PASSIO_API_KEY (or PASSIO_MODE=mock for labeled mock data).",
    );
  }
  async recognizeImage(): Promise<never> {
    this.fail();
  }
  async recognizeText(): Promise<never> {
    this.fail();
  }
  async lookupBarcode(): Promise<never> {
    this.fail();
  }
}

export function createProvider(config: AppConfig["passio"]): FoodRecognitionProvider {
  if (config.mode === "mock") return new MockProvider();
  if (!config.apiKey) return new UnconfiguredProvider();
  return new PassioProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
}
