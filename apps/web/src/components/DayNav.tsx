import { formatLongDate, shiftIsoDate, todayIso } from "../lib/format";

export function DayNav({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const isToday = date === todayIso();
  return (
    <div className="day-nav">
      <button type="button" className="btn secondary small" onClick={() => onChange(shiftIsoDate(date, -1))} aria-label="Previous day">
        ‹ Prev
      </button>
      <h2 className="day-title" aria-live="polite">
        {isToday ? "Today, " : ""}
        {formatLongDate(date)}
      </h2>
      <button type="button" className="btn secondary small" onClick={() => onChange(shiftIsoDate(date, 1))} aria-label="Next day">
        Next ›
      </button>
      {!isToday && (
        <button type="button" className="btn link small" onClick={() => onChange(todayIso())}>
          Back to today
        </button>
      )}
    </div>
  );
}
