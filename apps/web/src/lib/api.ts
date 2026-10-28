/** Typed client for the app's own backend. The browser never calls Passio directly. */

export type NutrientKey = "calories" | "proteinG" | "carbohydratesG" | "fatG";
export type Nutrients = Record<NutrientKey, number | null>;
export type InputType = "photo" | "text" | "barcode" | "voice" | "label" | "meal_plan";
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

export type Goal = "balanced" | "more_protein" | "more_fiber" | "more_vegetables" | "steady_energy";
export type DietPreference = "vegetarian" | "vegan" | "pescatarian" | "gluten_free" | "dairy_free" | "halal" | "kosher";
export type Profile = {
  goal: Goal;
  dailyCalorieTarget: number | null;
  dietPreferences: DietPreference[];
  avoidFoods: string[];
  updatedAt: string | null;
};
export type AdvisorTurn = { question: string; answer: string };
export type AdvisorResponse = { answer: string; source: ProviderSource; requestId: string | null };

export type MealPlanStatus = "preview" | "generating" | "ready" | "failed";
export type PlanMacros = { calories: number | null; proteinG: number | null; carbohydratesG: number | null; fatG: number | null; fiberG: number | null };
export type PlanRecipe = {
  index: number;
  name: string;
  rejected: boolean;
  preparation: string | null;
  macros: PlanMacros | null;
  ingredients: { name: string; serving: string | null; calories: number | null }[];
};
export type MealPlan = {
  id: string;
  status: MealPlanStatus;
  dayCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  source: ProviderSource;
  days: { day: number; macros: PlanMacros | null; meals: { slot: string; recipes: PlanRecipe[] }[] }[];
  shoppingList: { name: string; portionQuantity?: number | null; portionSize?: string | null }[];
  shoppingListHumanized: { name: string; shoppingName: string | null; quantity: number | null; unit: string | null; notes: string | null }[] | null;
};
export type MealPlanSummary = Pick<MealPlan, "id" | "status" | "dayCount" | "notes" | "errorCode" | "createdAt">;
export type MealTarget = { day: number; slot: string; index: number };

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

function uploadImage(inputType: "photo" | "label", image: Blob) {
  const form = new FormData();
  form.append("inputType", inputType);
  form.append("image", image, `${inputType}.jpg`);
  return call<RecognitionResponse>("/food-recognition", { method: "POST", body: form });
}

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const dayQuery = (date: string) => `date=${encodeURIComponent(date)}&tz=${encodeURIComponent(browserTimeZone())}`;

export const api = {
  health: () => call<Health>("/health"),
  recognizeText: (inputType: "text" | "voice", text: string) =>
    call<RecognitionResponse>("/food-recognition", jsonInit("POST", { inputType, text })),
  recognizeBarcode: (barcode: string) =>
    call<RecognitionResponse>("/food-recognition", jsonInit("POST", { inputType: "barcode", barcode })),
  recognizePhoto: (image: Blob) => uploadImage("photo", image),
  recognizeLabel: (image: Blob) => uploadImage("label", image),
  listEntries: (date: string) => call<{ entries: FoodLogEntry[] }>(`/food-logs?${dayQuery(date)}`),
  getEntry: (id: string) => call<FoodLogEntry>(`/food-logs/${encodeURIComponent(id)}`),
  createEntry: (input: CreateEntryInput) => call<FoodLogEntry>("/food-logs", jsonInit("POST", input)),
  updateQuantity: (id: string, quantity: number) =>
    call<FoodLogEntry>(`/food-logs/${encodeURIComponent(id)}`, jsonInit("PATCH", { quantity })),
  deleteEntry: (id: string) => call<void>(`/food-logs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  summary: (date: string) => call<DailySummary>(`/nutrition-summary?${dayQuery(date)}`),
  getProfile: () => call<Profile>("/profile"),
  saveProfile: (p: Omit<Profile, "updatedAt">) => call<Profile>("/profile", jsonInit("PUT", p)),
  askAdvisor: (question: string, history: AdvisorTurn[]) =>
    call<AdvisorResponse>("/advisor", jsonInit("POST", { question, history, tz: browserTimeZone() })),
  listMealPlans: () => call<{ plans: MealPlanSummary[] }>("/meal-plans"),
  getMealPlan: (id: string) => call<MealPlan>(`/meal-plans/${encodeURIComponent(id)}`),
  createMealPlan: (days: number, notes: string | null) => call<MealPlan>("/meal-plans", jsonInit("POST", { days, notes })),
  regenerateMeals: (id: string, rejected: MealTarget[]) =>
    call<MealPlan>(`/meal-plans/${encodeURIComponent(id)}/regenerate`, jsonInit("POST", { rejected })),
  approveMealPlan: (id: string) => call<MealPlan>(`/meal-plans/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  humanizeShoppingList: (id: string) => call<MealPlan>(`/meal-plans/${encodeURIComponent(id)}/shopping-list/humanize`, { method: "POST" }),
  logPlannedMeal: (id: string, t: MealTarget) => call<FoodLogEntry>(`/meal-plans/${encodeURIComponent(id)}/log`, jsonInit("POST", t)),
  deleteMealPlan: (id: string) => call<void>(`/meal-plans/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
