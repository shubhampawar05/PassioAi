import { useEffect, useState } from "react";
import { api, ApiError, type MealPlan, type MealTarget, type PlanMacros } from "../lib/api";
import { formatNutrient } from "../lib/format";
import { GeneralGuidanceNotice } from "./AdvisorAnswer";
import { ErrorBox, MockBadge, Spinner } from "./common";

const POLL_MS = 3000;
const PLAN_NOTICE_EXTRA = "Check every ingredient for allergies; the plan may include foods you asked to avoid.";

const slotLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const key = (t: MealTarget) => `${t.day}:${t.slot}:${t.index}`;

function MacroLine({ m }: { m: PlanMacros | null }) {
  if (!m) return <span className="muted small">Nutrition not available</span>;
  return (
    <span className="small">
      {formatNutrient(m.calories, "kcal")} · P {formatNutrient(m.proteinG, "g")} · C {formatNutrient(m.carbohydratesG, "g")} · F{" "}
      {formatNutrient(m.fatG, "g")}
    </span>
  );
}

type Props = { planId: string; onBack: () => void; onLogged: () => void };

export function MealPlanDetail({ planId, onBack, onLogged }: Props) {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [polling, setPolling] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [logged, setLogged] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getMealPlan(planId).then(setPlan, (e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load plan"));
  }, [planId]);

  // Poll while generating.
  const generating = plan?.status === "generating";
  useEffect(() => {
    if (!generating || !polling) return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    const poll = setInterval(() => {
      api.getMealPlan(planId).then(
        (p) => {
          if (p.status !== "generating") setPlan(p);
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [generating, polling, planId]);

  const run = async (label: string, fn: () => Promise<MealPlan | void>) => {
    setBusy(label);
    setError(null);
    try {
      const p = await fn();
      if (p) setPlan(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  if (error && !plan) return <ErrorBox message={error} />;
  if (!plan) return <Spinner label="Loading plan…" />;

  const toggleReject = (t: MealTarget) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(key(t))) next.delete(key(t));
      else next.add(key(t));
      return next;
    });

  const regenerate = () =>
    run("regenerate", async () => {
      const targets = [...rejected].map((k) => {
        const [day, slot, index] = k.split(":");
        return { day: Number(day), slot: slot!, index: Number(index) };
      });
      const p = await api.regenerateMeals(plan.id, targets);
      setRejected(new Set());
      return p;
    });

  const approve = () =>
    run("approve", async () => {
      setPolling(true);
      setElapsed(0);
      return api.approveMealPlan(plan.id);
    });

  const logMeal = (t: MealTarget) =>
    run(`log-${key(t)}`, async () => {
      await api.logPlannedMeal(plan.id, t);
      setLogged((prev) => new Set(prev).add(key(t)));
      onLogged();
    });

  const isPreview = plan.status === "preview";
  const isReady = plan.status === "ready";

  return (
    <section className="card" aria-labelledby="plan-heading">
      <button type="button" className="btn link small" onClick={onBack}>
        ‹ All meal plans
      </button>
      <h2 id="plan-heading">
        {plan.dayCount}-day meal plan {plan.source === "mock" && <MockBadge />}{" "}
        <span className={`badge status-${plan.status}`}>{plan.status}</span>
      </h2>
      {plan.notes && <p className="muted small">Notes: {plan.notes}</p>}
      <GeneralGuidanceNotice extra={PLAN_NOTICE_EXTRA} />

      {generating && (
        <div className="notice" role="status">
          {polling ? (
            <>
              <Spinner label={`Passio is generating the full plan… ${elapsed}s`} />
              <p className="small">This can take from a few seconds to several minutes. You can leave this page and come back.</p>
              <button type="button" className="btn secondary small" onClick={() => setPolling(false)}>
                Stop checking
              </button>
            </>
          ) : (
            <button type="button" className="btn secondary small" onClick={() => setPolling(true)}>
              Check again
            </button>
          )}
        </div>
      )}
      {plan.status === "failed" && (
        <ErrorBox message={`Generating the full plan failed (${plan.errorCode ?? "unknown error"}).`} onRetry={() => void approve()} />
      )}
      {error && <ErrorBox message={error} />}

      {isPreview && (
        <div className="notice small">
          Preview: meal names only. Mark meals you don&apos;t want and regenerate them, then approve to get recipes,
          ingredients, and nutrition. <strong>Full plans are expensive</strong> (about 130k Passio tokens for 2 days in
          testing).
        </div>
      )}

      {plan.days.map((d) => (
        <div key={d.day} className="plan-day">
          <h3>
            Day {d.day} {d.macros && <MacroLine m={d.macros} />}
          </h3>
          {d.meals.map((meal) =>
            meal.recipes.map((r) => {
              const t = { day: d.day, slot: meal.slot, index: r.index };
              const k = key(t);
              return (
                <div key={k} className={`plan-meal ${rejected.has(k) ? "excluded" : ""}`}>
                  <div className="plan-meal-head">
                    <div>
                      <span className="muted small">{slotLabel(meal.slot)}</span>
                      <div>
                        <strong>{r.name}</strong>
                      </div>
                      {isReady && <MacroLine m={r.macros} />}
                    </div>
                    {isPreview && (
                      <label className="checkbox small">
                        <input type="checkbox" checked={rejected.has(k)} onChange={() => toggleReject(t)} disabled={busy !== null} />
                        Replace
                      </label>
                    )}
                    {isReady && (
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={busy !== null || logged.has(k)}
                        onClick={() => void logMeal(t)}
                      >
                        {logged.has(k) ? "Logged ✓" : busy === `log-${k}` ? "Logging…" : "Log this meal"}
                      </button>
                    )}
                  </div>
                  {isReady && (r.ingredients.length > 0 || r.preparation) && (
                    <details>
                      <summary className="small">Ingredients and preparation</summary>
                      <ul className="small">
                        {r.ingredients.map((ing, i) => (
                          <li key={i}>
                            {ing.name}
                            {ing.serving ? ` — ${ing.serving}` : ""}
                            {ing.calories !== null ? ` (${formatNutrient(ing.calories, "kcal")})` : ""}
                          </li>
                        ))}
                      </ul>
                      {r.preparation && <p className="small">{r.preparation}</p>}
                    </details>
                  )}
                </div>
              );
            }),
          )}
        </div>
      ))}

      {isPreview && (
        <div className="actions">
          <button type="button" className="btn secondary" disabled={busy !== null || rejected.size === 0} onClick={() => void regenerate()}>
            {busy === "regenerate" ? "Regenerating…" : `Regenerate ${rejected.size || ""} selected`}
          </button>
          <button type="button" className="btn primary" disabled={busy !== null || rejected.size > 0} onClick={() => void approve()}>
            {busy === "approve" ? "Starting…" : "Approve and generate full plan"}
          </button>
        </div>
      )}

      {isReady && (
        <div className="plan-shopping">
          <h3>Shopping list</h3>
          {plan.shoppingListHumanized ? (
            <ul className="small">
              {plan.shoppingListHumanized.map((i, idx) => (
                <li key={idx}>
                  {i.shoppingName ?? i.name}
                  {i.quantity !== null ? `, ${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : ""}
                  {i.notes ? <span className="muted"> ({i.notes})</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul className="small">
                {plan.shoppingList.map((i, idx) => (
                  <li key={idx}>
                    {i.name}
                    {i.portionQuantity ? `, ${i.portionQuantity} ${i.portionSize ?? ""}` : ""}
                  </li>
                ))}
              </ul>
              {plan.shoppingList.length > 0 && (
                <button type="button" className="btn secondary small" disabled={busy !== null} onClick={() => void run("humanize", () => api.humanizeShoppingList(plan.id))}>
                  {busy === "humanize" ? "Converting…" : "Make shopping-friendly"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn danger small"
          disabled={busy !== null}
          onClick={() => {
            if (window.confirm("Delete this meal plan? Meals you already logged stay in your diary.")) {
              void run("delete", async () => {
                await api.deleteMealPlan(plan.id);
                onBack();
              });
            }
          }}
        >
          Delete plan
        </button>
      </div>
    </section>
  );
}
