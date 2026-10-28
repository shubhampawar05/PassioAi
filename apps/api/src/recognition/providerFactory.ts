import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import {
  MockGuidanceProvider,
  PassioGuidanceProvider,
  UnconfiguredGuidanceProvider,
  type NutritionGuidanceProvider,
} from "../advisor/guidanceProvider.js";
import { MockProvider } from "./mockProvider.js";
import { PassioClient } from "./passioClient.js";
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
  async recognizeLabel(): Promise<never> {
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
  return createProviders(config).recognition;
}

/** Builds recognition and guidance providers that share one PassioClient (one token cache). */
export function createProviders(config: AppConfig["passio"]): {
  recognition: FoodRecognitionProvider;
  guidance: NutritionGuidanceProvider;
} {
  if (config.mode === "mock") return { recognition: new MockProvider(), guidance: new MockGuidanceProvider() };
  if (!config.apiKey) return { recognition: new UnconfiguredProvider(), guidance: new UnconfiguredGuidanceProvider() };
  const client = new PassioClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
  return { recognition: new PassioProvider(client), guidance: new PassioGuidanceProvider(client) };
}
