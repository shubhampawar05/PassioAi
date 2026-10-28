import type { Nutrients } from "../lib/api";
import { formatNutrient, NUTRIENTS } from "../lib/format";

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn secondary small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function NutrientTable({ nutrients, caption }: { nutrients: Nutrients; caption?: string }) {
  return (
    <table className="nutrients">
      {caption && <caption>{caption}</caption>}
      <tbody>
        {NUTRIENTS.map((n) => {
          const value = nutrients[n.key];
          return (
            <tr key={n.key}>
              <th scope="row">{n.label}</th>
              <td className={value === null ? "muted" : undefined}>{formatNutrient(value, n.unit)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MockBadge() {
  return (
    <span className="badge mock" title="Development mock data, not from Passio">
      MOCK DATA
    </span>
  );
}
