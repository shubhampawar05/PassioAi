import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type DailySummary, type FoodLogEntry } from "../lib/api";

export function useDayData(date: string) {
  const [entries, setEntries] = useState<FoodLogEntry[] | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listEntries(date), api.summary(date)])
      .then(([list, sum]) => {
        if (cancelled) return;
        setEntries(list.entries);
        setSummary(sum);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load food log");
      });
    return () => {
      cancelled = true;
    };
  }, [date, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loading = !error && (entries === null || summary === null);
  return { entries, summary, error, loading, reload };
}
