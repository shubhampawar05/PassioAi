import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewResult } from "../src/components/ReviewResult";
import { SummaryCard } from "../src/components/SummaryCard";
import type { RecognitionResponse } from "../src/lib/api";

const result = (overrides: Partial<RecognitionResponse> = {}): RecognitionResponse => ({
  source: "passio",
  requestId: "r1",
  inputType: "text",
  inputSummary: "apple and toast",
  candidates: [
    {
      name: "Apple",
      providerRef: "ref-a",
      providerDetails: {},
      servings: [{ label: "1 medium (182 g)", weightG: 182, defaultQuantity: 1, nutrients: { calories: 95, proteinG: 0.5, carbohydratesG: 25, fatG: null } }],
    },
    {
      name: "Toast",
      providerRef: null,
      providerDetails: {},
      servings: [{ label: "1 slice", weightG: null, defaultQuantity: 1, nutrients: { calories: 80, proteinG: null, carbohydratesG: null, fatG: null } }],
    },
  ],
  ...overrides,
});

const noop = () => {};

describe("ReviewResult", () => {
  it("shows 'Not available' for missing nutrients instead of zero", () => {
    render(<ReviewResult result={result()} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    const apple = screen.getByText("Apple").closest("li")!;
    const fatRow = within(apple).getByText("Fat").closest("tr")!;
    expect(within(fatRow).getByText("Not available")).toBeInTheDocument();
    expect(within(apple).getByText("95 kcal")).toBeInTheDocument();
    expect(screen.getByText(/are estimates/)).toBeInTheDocument();
  });

  it("saves only the selected candidates with per-serving values and quantity", async () => {
    const onSave = vi.fn();
    render(<ReviewResult result={result()} saving={false} onSave={onSave} onRetryText={noop} onCancel={noop} />);
    await userEvent.click(within(screen.getByText("Toast").closest("li")!).getByRole("checkbox"));
    const qty = within(screen.getByText("Apple").closest("li")!).getByLabelText("Quantity");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2");
    await userEvent.click(screen.getByRole("button", { name: /confirm and save/i }));
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        foodName: "Apple",
        quantity: 2,
        servingUnit: "1 medium (182 g)",
        perServing: { calories: 95, proteinG: 0.5, carbohydratesG: 25, fatG: null },
        provider: "passio",
        inputType: "text",
      }),
    ]);
  });

  it("disables saving for an invalid quantity", async () => {
    render(<ReviewResult result={result()} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    const qty = within(screen.getByText("Apple").closest("li")!).getByLabelText("Quantity");
    await userEvent.clear(qty);
    await userEvent.type(qty, "0");
    expect(screen.getByRole("button", { name: /confirm and save/i })).toBeDisabled();
  });

  it("shows a no-match state and allows retry with a corrected description", async () => {
    const onRetryText = vi.fn();
    render(<ReviewResult result={result({ candidates: [] })} saving={false} onSave={noop} onRetryText={onRetryText} onCancel={noop} />);
    expect(screen.getByText(/No foods were recognized/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm and save/i })).toBeDisabled();
    const input = screen.getByLabelText(/Correct the description/);
    await userEvent.clear(input);
    await userEvent.type(input, "green apple");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryText).toHaveBeenCalledWith("green apple");
  });

  it("labels mock results visibly", () => {
    render(<ReviewResult result={result({ source: "mock" })} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    expect(screen.getByText("MOCK DATA")).toBeInTheDocument();
  });
});

describe("SummaryCard", () => {
  it("flags partial totals and missing nutrients", () => {
    render(
      <SummaryCard
        summary={{
          date: "2026-10-28",
          tz: "UTC",
          entryCount: 2,
          nutrients: {
            calories: { total: 175, contributingEntries: 2, missingEntries: 0 },
            proteinG: { total: 0.5, contributingEntries: 1, missingEntries: 1 },
            carbohydratesG: { total: 25, contributingEntries: 1, missingEntries: 1 },
            fatG: { total: 0, contributingEntries: 0, missingEntries: 2 },
          },
        }}
      />,
    );
    expect(screen.getByText("175 kcal")).toBeInTheDocument();
    expect(screen.getAllByText("Partial: missing for 1 of 2")).toHaveLength(2);
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });
});

describe("ReviewResult for label scans", () => {
  const label = result({
    inputType: "label",
    inputSummary: "label photo (image/jpeg, 120 KB)",
    candidates: [
      {
        name: "Crunchy Peanut Butter",
        providerRef: null,
        providerDetails: { ingredientsText: "roasted peanuts; sugar; palm oil; salt" },
        servings: [{ label: "tbsp (16 g)", weightG: 16, defaultQuantity: 2, nutrients: { calories: 95, proteinG: 4, carbohydratesG: 3.5, fatG: 8 } }],
      },
    ],
  });

  it("shows ingredients with an allergen reminder and no allergen claim", () => {
    render(<ReviewResult result={label} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    expect(screen.getByText(/roasted peanuts; sugar; palm oil; salt/)).toBeInTheDocument();
    expect(screen.getByText(/Always check the package for allergens/)).toBeInTheDocument();
    expect(screen.queryByText(/allergen[- ]free|contains no allergens|safe for/i)).not.toBeInTheDocument();
  });

  it("defaults to the label's serving count (2 × tbsp = 190 kcal)", () => {
    render(<ReviewResult result={label} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    expect(screen.getByLabelText("Quantity")).toHaveValue(2);
    expect(screen.getByText("190 kcal")).toBeInTheDocument();
  });

  it("gives a retake hint when the label could not be read", () => {
    render(<ReviewResult result={{ ...label, candidates: [] }} saving={false} onSave={noop} onRetryText={noop} onCancel={noop} />);
    expect(screen.getByText(/Retake the photo closer/)).toBeInTheDocument();
  });
});
