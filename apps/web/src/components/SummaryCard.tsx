import type { DailySummary } from "../lib/api";
import { formatNutrient, NUTRIENTS } from "../lib/format";

export function SummaryCard({ summary }: { summary: DailySummary }) {
  return (
    <section className="card" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Daily summary</h2>
      <p className="muted">
        {summary.entryCount} {summary.entryCount === 1 ? "entry" : "entries"} logged
      </p>
      <dl className="tiles">
        {NUTRIENTS.map((n) => {
          const s = summary.nutrients[n.key];
          const noData = summary.entryCount > 0 && s.contributingEntries === 0;
          return (
            <div className="tile" key={n.key}>
              <dt>{n.label}</dt>
              <dd className="tile-value">{noData ? "Not available" : formatNutrient(s.total, n.unit)}</dd>
              {s.missingEntries > 0 && s.contributingEntries > 0 && (
                <dd className="tile-note">
                  Partial: missing for {s.missingEntries} of {summary.entryCount}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
