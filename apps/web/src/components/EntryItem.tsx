import { useState } from "react";
import { api, ApiError, type FoodLogEntry } from "../lib/api";
import { formatNutrient, formatTime, INPUT_LABELS } from "../lib/format";
import { ErrorBox, MockBadge, NutrientTable } from "./common";

type Props = {
  entry: FoodLogEntry;
  /** Enables detail view, quantity edit, and delete. */
  editable?: boolean;
  onChanged?: () => void;
};

export function EntryItem({ entry, editable = false, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const qty = Number(quantity);
  const qtyValid = Number.isFinite(qty) && qty > 0 && qty <= 100;

  return (
    <li className="entry">
      <div className="entry-head">
        <div>
          <strong>{entry.foodName}</strong> {entry.provider === "mock" && <MockBadge />}
          <div className="muted small">
            {formatTime(entry.loggedAt)} · {INPUT_LABELS[entry.inputType]} · {entry.quantity} × {entry.servingUnit}
          </div>
        </div>
        <div className="entry-kcal">{formatNutrient(entry.totals.calories, "kcal")}</div>
      </div>
      <div className="muted small">
        P {formatNutrient(entry.totals.proteinG, "g")} · C {formatNutrient(entry.totals.carbohydratesG, "g")} · F{" "}
        {formatNutrient(entry.totals.fatG, "g")}
      </div>

      {editable && (
        <>
          <button type="button" className="btn link small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide details" : "Details"}
          </button>
          {open && (
            <div className="entry-details">
              <NutrientTable nutrients={entry.perServing} caption={`Per serving (${entry.servingUnit})`} />
              <p className="muted small">
                Input: {entry.inputSummary}
                {entry.providerRef ? ` · Provider ref: ${entry.providerRef.slice(0, 24)}${entry.providerRef.length > 24 ? "…" : ""}` : ""}
              </p>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (qtyValid) void run(() => api.updateQuantity(entry.id, qty));
                }}
              >
                <label>
                  Servings
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    aria-invalid={!qtyValid}
                  />
                </label>
                <button type="submit" className="btn secondary small" disabled={busy || !qtyValid || qty === entry.quantity}>
                  Update quantity
                </button>
                <button
                  type="button"
                  className="btn danger small"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete "${entry.foodName}"?`)) void run(() => api.deleteEntry(entry.id));
                  }}
                >
                  Delete
                </button>
              </form>
              <p className="muted small">Updating quantity recalculates from the stored per-serving values; Passio is not called again.</p>
              {error && <ErrorBox message={error} />}
            </div>
          )}
        </>
      )}
    </li>
  );
}
