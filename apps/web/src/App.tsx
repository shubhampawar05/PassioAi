import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Diary } from "./components/Diary";
import { LogFood } from "./components/LogFood";
import { api, type Health } from "./lib/api";
import { todayIso } from "./lib/format";

type View = "dashboard" | "log" | "diary";

const VIEWS: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "log", label: "Log food" },
  { id: "diary", label: "Diary" },
];

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [date, setDate] = useState(todayIso);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth, () => setHealthError(true));
  }, []);

  return (
    <>
      <header className="app-header">
        <div className="container header-inner">
          <h1>Food Log <span className="badge">POC</span></h1>
          <nav aria-label="Main">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`nav-btn ${view === v.id ? "active" : ""}`}
                aria-current={view === v.id ? "page" : undefined}
                onClick={() => {
                  setView(v.id);
                  setFlash(null);
                }}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {health?.recognitionProvider === "mock" && (
        <div className="banner mock" role="status">
          MOCK MODE: recognition results are development mock data, not Passio output.
        </div>
      )}
      {health?.recognitionProvider === "unconfigured" && (
        <div className="banner warn" role="status">
          Passio is not configured on the server (PASSIO_API_KEY missing). Food recognition will fail until it is set.
        </div>
      )}
      {(healthError || health?.database === "error") && (
        <div className="banner warn" role="alert">
          The server or database is unavailable. Check that the API and PostgreSQL are running.
        </div>
      )}

      <main className="container">
        {flash && (
          <div className="success" role="status">
            {flash}
          </div>
        )}
        {view === "dashboard" && (
          <Dashboard date={date} onDateChange={setDate} onLogFood={() => setView("log")} onOpenDiary={() => setView("diary")} />
        )}
        {view === "log" && (
          <LogFood
            onSaved={() => {
              setDate(todayIso());
              setView("dashboard");
              setFlash("Saved to your food diary.");
            }}
          />
        )}
        {view === "diary" && <Diary date={date} onDateChange={setDate} />}
      </main>

      <footer className="container footer">
        Demo only, using synthetic data. Nutrition values come from Passio Nutrition AI and are approximate
        estimates. This is not a medical device and does not provide medical or dietary advice.
      </footer>
    </>
  );
}
