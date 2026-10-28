import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealPlanDetail } from "../src/components/MealPlanDetail";
import { api, type MealPlan } from "../src/lib/api";

const recipe = (name: string, fat: number | null) => ({
  index: 0,
  name,
  rejected: false,
  preparation: "Mix.",
  macros: { calories: 370.2, proteinG: 48.1, carbohydratesG: 28.7, fatG: fat, fiberG: 6.2 },
  ingredients: [{ name: "Greek Yogurt", serving: "cup (245 g)", calories: 144.6 }],
});

const plan = (status: MealPlan["status"]): MealPlan => ({
  id: "11111111-1111-4111-8111-111111111111",
  status,
  dayCount: 1,
  notes: null,
  createdAt: "2026-10-28T10:00:00Z",
  updatedAt: "2026-10-28T10:00:00Z",
  errorCode: status === "failed" ? "PROVIDER_TIMEOUT" : null,
  source: "passio",
  days: [{ day: 1, macros: null, meals: [{ slot: "breakfast", recipes: [recipe("Yogurt Bowl", null)] }] }],
  shoppingList: [{ name: "Greek Yogurt", portionQuantity: 1, portionSize: "cup" }],
  shoppingListHumanized: null,
});

afterEach(() => vi.restoreAllMocks());

describe("MealPlanDetail", () => {
  it.each(["preview", "generating", "ready", "failed"] as const)("shows the general-suggestion and allergy notice when %s", async (status) => {
    vi.spyOn(api, "getMealPlan").mockResolvedValue(plan(status));
    render(<MealPlanDetail planId="x" onBack={() => {}} onLogged={() => {}} />);
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(/not medical advice/);
    expect(note).toHaveTextContent(/allergies/);
  });

  it("shows ready recipes with Passio macros and Not available for missing fat", async () => {
    vi.spyOn(api, "getMealPlan").mockResolvedValue(plan("ready"));
    render(<MealPlanDetail planId="x" onBack={() => {}} onLogged={() => {}} />);
    expect(await screen.findByText("Yogurt Bowl")).toBeInTheDocument();
    expect(screen.getByText(/370.2 kcal · P 48.1 g · C 28.7 g · F Not available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log this meal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make shopping-friendly" })).toBeInTheDocument();
  });

  it("offers reject toggles and the cost note on previews", async () => {
    vi.spyOn(api, "getMealPlan").mockResolvedValue(plan("preview"));
    render(<MealPlanDetail planId="x" onBack={() => {}} onLogged={() => {}} />);
    expect(await screen.findByLabelText("Replace")).toBeInTheDocument();
    expect(screen.getByText(/Full plans are expensive/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log this meal" })).not.toBeInTheDocument();
  });

  it("shows the failure code with a retry", async () => {
    vi.spyOn(api, "getMealPlan").mockResolvedValue(plan("failed"));
    render(<MealPlanDetail planId="x" onBack={() => {}} onLogged={() => {}} />);
    expect(await screen.findByText(/PROVIDER_TIMEOUT/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
