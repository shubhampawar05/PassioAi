import { DayNav } from "./DayNav";
import { EntryItem } from "./EntryItem";
import { SummaryCard } from "./SummaryCard";
import { ErrorBox, Spinner } from "./common";
import { useDayData } from "./useDayData";

type Props = { date: string; onDateChange: (d: string) => void; onLogFood: () => void; onOpenDiary: () => void };

export function Dashboard({ date, onDateChange, onLogFood, onOpenDiary }: Props) {
  const { entries, summary, error, loading, reload } = useDayData(date);
  const recent = entries?.slice(0, 5) ?? [];

  return (
    <>
      <DayNav date={date} onChange={onDateChange} />
      <div className="actions">
        <button type="button" className="btn primary" onClick={onLogFood}>
          + Log food
        </button>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && <Spinner label="Loading…" />}
      {summary && <SummaryCard summary={summary} />}
      {entries && (
        <section className="card" aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent entries</h2>
          {entries.length === 0 ? (
            <div className="empty">
              <p>No food logged for this day yet.</p>
              <button type="button" className="btn primary" onClick={onLogFood}>
                Log your first meal
              </button>
            </div>
          ) : (
            <>
              <ul className="entries">
                {recent.map((e) => (
                  <EntryItem key={e.id} entry={e} />
                ))}
              </ul>
              <button type="button" className="btn link" onClick={onOpenDiary}>
                {entries.length > recent.length ? `View all ${entries.length} entries in diary` : "Open diary to edit or delete"}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
