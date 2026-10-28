import { DayNav } from "./DayNav";
import { EntryItem } from "./EntryItem";
import { SummaryCard } from "./SummaryCard";
import { ErrorBox, Spinner } from "./common";
import { useDayData } from "./useDayData";

export function Diary({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const { entries, summary, error, loading, reload } = useDayData(date);

  return (
    <>
      <DayNav date={date} onChange={onDateChange} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && <Spinner label="Loading…" />}
      {entries && (
        <section className="card" aria-labelledby="diary-heading">
          <h2 id="diary-heading">Food diary</h2>
          {entries.length === 0 ? (
            <p className="empty">No entries for this day.</p>
          ) : (
            <ul className="entries">
              {entries.map((e) => (
                <EntryItem key={`${e.id}-${e.updatedAt}`} entry={e} editable onChanged={reload} />
              ))}
            </ul>
          )}
        </section>
      )}
      {summary && <SummaryCard summary={summary} />}
    </>
  );
}
