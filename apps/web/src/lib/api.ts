/** Typed client for the app's own backend. The browser never calls Passio directly. */

export type NutrientKey = "calories" | "proteinG" | "carbohydratesG" | "fatG";
export type Nutrients = Record<NutrientKey, number | null>;
export type InputType = "photo" | "text" | "barcode" | "voice";
export type ProviderSource = "passio" | "mock";

export type ServingOption = {
  label: string;
  weightG: number | null;
  defaultQuantity: number;
  nutrients: Nutrients;
};

export type FoodCandidate = {
  name: string;
  providerRef: string | null;
  servings: ServingOption[];
  providerDetails: Record<string, unknown>;
};

export type RecognitionResponse = {
  source: ProviderSource;
  candidates: FoodCandidate[];
  requestId: string | null;
  inputType: InputType;
  inputSummary: string;
};

export type FoodLogEntry = {
  id: string;
  loggedAt: string;
  inputType: InputType;
  inputSummary: string;
  foodName: string;
  servingUnit: string;
  servingWeightG: number | null;
  quantity: number;
  perServing: Nutrients;
  totals: Nutrients;
  provider: ProviderSource;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NutrientSummary = { total: number; contributingEntries: number; missingEntries: number };
export type DailySummary = {
  date: string;
  tz: string;
  entryCount: number;
  nutrients: Record<NutrientKey, NutrientSummary>;
};

export type Health = {
  status: "ok" | "degraded";
  database: "ok" | "error";
  recognitionProvider: "passio" | "mock" | "unconfigured";
};

export type CreateEntryInput = {
  inputType: InputType;
  inputSummary: string;
  foodName: string;
  servingUnit: string;
  servingWeightG: number | null;
  quantity: number;
  perServing: Nutrients;
  provider: ProviderSource;
  providerRef: string | null;
  providerDetails?: Record<string, unknown>;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check that the API is running.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (HTTP ${res.status})`);
  }
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const dayQuery = (date: string) => `date=${encodeURIComponent(date)}&tz=${encodeURIComponent(browserTimeZone())}`;

export const api = {
  health: () => call<Health>("/health"),
  recognizeText: (inputType: "text" | "voice", text: string) =>
    call<RecognitionResponse>("/food-recognition", jsonInit("POST", { inputType, text })),
  recognizeBarcode: (barcode: string) =>
    call<RecognitionResponse>("/food-recognition", jsonInit("POST", { inputType: "barcode", barcode })),
  recognizePhoto: (image: Blob) => {
    const form = new FormData();
    form.append("image", image, "photo.jpg");
    return call<RecognitionResponse>("/food-recognition", { method: "POST", body: form });
  },
  listEntries: (date: string) => call<{ entries: FoodLogEntry[] }>(`/food-logs?${dayQuery(date)}`),
  getEntry: (id: string) => call<FoodLogEntry>(`/food-logs/${encodeURIComponent(id)}`),
  createEntry: (input: CreateEntryInput) => call<FoodLogEntry>("/food-logs", jsonInit("POST", input)),
  updateQuantity: (id: string, quantity: number) =>
    call<FoodLogEntry>(`/food-logs/${encodeURIComponent(id)}`, jsonInit("PATCH", { quantity })),
  deleteEntry: (id: string) => call<void>(`/food-logs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  summary: (date: string) => call<DailySummary>(`/nutrition-summary?${dayQuery(date)}`),
};
