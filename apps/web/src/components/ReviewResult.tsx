import { useState } from "react";
import type { CreateEntryInput, FoodCandidate, Nutrients, RecognitionResponse } from "../lib/api";
import { MockBadge, NutrientTable } from "./common";

type Selection = { include: boolean; servingIndex: number; quantity: string };

function scale(n: Nutrients, q: number): Nutrients {
  const s = (v: number | null) => (v === null ? null : Math.round(v * q * 10) / 10);
  return { calories: s(n.calories), proteinG: s(n.proteinG), carbohydratesG: s(n.carbohydratesG), fatG: s(n.fatG) };
}

const validQty = (q: string) => {
  const n = Number(q);
  return Number.isFinite(n) && n > 0 && n <= 100;
};

type Props = {
  result: RecognitionResponse;
  saving: boolean;
  onSave: (entries: CreateEntryInput[]) => void;
  onRetryText: (text: string) => void;
  onCancel: () => void;
};

export function ReviewResult({ result, saving, onSave, onRetryText, onCancel }: Props) {
  const [selections, setSelections] = useState<Selection[]>(() =>
    result.candidates.map((c) => ({
      include: true,
      servingIndex: 0,
      quantity: String(c.servings[0]?.defaultQuantity ?? 1),
    })),
  );
  const [correction, setCorrection] = useState(
    result.inputType === "text" || result.inputType === "voice"
      ? result.inputSummary
      : result.candidates.map((c) => c.name).join(", "),
  );

  const update = (i: number, patch: Partial<Selection>) =>
    setSelections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const chosen = result.candidates
    .map((c, i) => ({ c, s: selections[i]! }))
    .filter(({ c, s }) => s.include && c.servings[s.servingIndex]);
  const canSave = chosen.length > 0 && chosen.every(({ s }) => validQty(s.quantity)) && !saving;

  const save = () => {
    onSave(
      chosen.map(({ c, s }) => {
        const serving = c.servings[s.servingIndex]!;
        return {
          inputType: result.inputType,
          inputSummary: result.inputSummary,
          foodName: c.name,
          servingUnit: serving.label,
          servingWeightG: serving.weightG,
          quantity: Number(s.quantity),
          perServing: serving.nutrients,
          provider: result.source,
          providerRef: c.providerRef,
          providerDetails: c.providerDetails,
        };
      }),
    );
  };

  return (
    <section className="card" aria-labelledby="review-heading">
      <h2 id="review-heading">
        Review before saving {result.source === "mock" && <MockBadge />}
      </h2>
      <p className="muted small">
        Values come from {result.source === "mock" ? "the development mock (not Passio)" : "Passio Nutrition AI"} and
        are estimates; portions and nutrients may be inaccurate. Nothing is saved until you confirm.
      </p>

      {result.candidates.length === 0 ? (
        <p className="empty" role="status">
          {result.inputType === "label"
            ? "Passio could not read a product from this label. Retake the photo closer, with the whole Nutrition Facts panel in frame and no glare, or describe the food below."
            : "No foods were recognized. Try a clearer photo, a different barcode, or describe the food below."}
        </p>
      ) : (
        <ul className="candidates">
          {result.candidates.map((c: FoodCandidate, i) => {
            const s = selections[i]!;
            const serving = c.servings[s.servingIndex];
            const qOk = validQty(s.quantity);
            const ingredients = typeof c.providerDetails.ingredientsText === "string" ? c.providerDetails.ingredientsText : null;
            return (
              <li key={`${c.name}-${i}`} className={`candidate ${s.include ? "" : "excluded"}`}>
                <label className="checkbox">
                  <input type="checkbox" checked={s.include} onChange={(e) => update(i, { include: e.target.checked })} />
                  <strong>{c.name}</strong>
                </label>
                {serving ? (
                  <>
                    <div className="row">
                      <label>
                        Serving
                        <select value={s.servingIndex} onChange={(e) => update(i, { servingIndex: Number(e.target.value) })}>
                          {c.servings.map((opt, idx) => (
                            <option key={idx} value={idx}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Quantity
                        <input
                          type="number"
                          min="0.1"
                          max="100"
                          step="0.1"
                          value={s.quantity}
                          aria-invalid={!qOk}
                          onChange={(e) => update(i, { quantity: e.target.value })}
                        />
                      </label>
                    </div>
                    {!qOk && <p className="field-error">Enter a quantity between 0.1 and 100.</p>}
                    <NutrientTable
                      nutrients={scale(serving.nutrients, qOk ? Number(s.quantity) : 1)}
                      caption={`Estimated for ${qOk ? s.quantity : 1} × ${serving.label}`}
                    />
                  </>
                ) : (
                  <p className="muted">No serving information available.</p>
                )}
                {ingredients && (
                  <p className="muted small ingredients">
                    <strong>Ingredients (from Passio):</strong> {ingredients}
                    <br />
                    Always check the package for allergens.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : `Confirm and save${chosen.length > 1 ? ` ${chosen.length} items` : ""}`}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>
          Discard
        </button>
      </div>

      <form
        className="correction"
        onSubmit={(e) => {
          e.preventDefault();
          if (correction.trim()) onRetryText(correction.trim());
        }}
      >
        <label htmlFor="correction">Not right? Correct the description and search again (uses Passio text recognition)</label>
        <div className="row">
          <input id="correction" type="text" maxLength={500} value={correction} onChange={(e) => setCorrection(e.target.value)} />
          <button type="submit" className="btn secondary" disabled={saving || !correction.trim()}>
            Retry
          </button>
        </div>
      </form>
    </section>
  );
}
