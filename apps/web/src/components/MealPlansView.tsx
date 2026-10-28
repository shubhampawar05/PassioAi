import { useEffect, useState } from "react";
import { api, ApiError, type MealPlanSummary, type Profile } from "../lib/api";
import { GeneralGuidanceNotice } from "./AdvisorAnswer";
import { ErrorBox, Spinner } from "./common";
import { MealPlanDetail } from "./MealPlanDetail";
import { DIET_LABELS, GOAL_LABELS } from "./ProfileView";

type Props = { onEditProfile: () => void; onLogged: () => void };

export function MealPlansView({ onEditProfile, onLogged }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [plans, setPlans] = useState<MealPlanSummary[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState(3);
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (openId) return;
    Promise.all([api.listMealPlans(), api.getProfile()]).then(
      ([list, p]) => {
        setPlans(list.plans);
        setProfile(p);
      },
      (e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load meal plans"),
    );
  }, [openId, version]);

  if (openId) {
    return (
      <MealPlanDetail
        planId={openId}
        onLogged={onLogged}
        onBack={() => {
          setOpenId(null);
          setVersion((v) => v + 1);
        }}
      />
    );
  }

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const plan = await api.createMealPlan(days, notes.trim() || null);
      setNotes("");
      setOpenId(plan.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the plan");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="new-plan-heading">
        <h2 id="new-plan-heading">New meal plan</h2>
        <GeneralGuidanceNotice extra="Check ingredients for allergies." />
        {profile && (
          <p className="small">
            Based on your profile: <strong>{GOAL_LABELS[profile.goal]}</strong>
            {profile.dailyCalorieTarget ? `, about ${profile.dailyCalorieTarget} kcal/day` : ""}
            {profile.dietPreferences.length ? `, ${profile.dietPreferences.map((d) => DIET_LABELS[d]).join(", ")}` : ""}
            {profile.avoidFoods.length ? `, avoiding ${profile.avoidFoods.join(", ")}` : ""}.{" "}
            <button type="button" className="btn link small inline-link" onClick={onEditProfile}>
              Edit profile
            </button>
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="plan-days">Days (1–7)</label>
          <select id="plan-days" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={creating}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
          <label htmlFor="plan-notes">Notes (optional)</label>
          <input
            id="plan-notes"
            type="text"
            maxLength={300}
            placeholder="e.g. quick weekday lunches, no mushrooms"
            value={notes}
            disabled={creating}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={creating}>
            {creating ? "Asking Passio…" : "Create preview"}
          </button>
        </form>
        {creating && <Spinner label="Generating a preview (usually under 20 s)…" />}
        {error && <ErrorBox message={error} />}
      </section>

      <section className="card" aria-labelledby="plans-heading">
        <h2 id="plans-heading">Your meal plans</h2>
        {!plans && !error && <Spinner label="Loading…" />}
        {plans?.length === 0 && <p className="empty">No meal plans yet.</p>}
        {plans && plans.length > 0 && (
          <ul className="entries">
            {plans.map((p) => (
              <li key={p.id} className="entry">
                <div className="entry-head">
                  <button type="button" className="btn link" onClick={() => setOpenId(p.id)}>
                    {p.dayCount}-day plan · {new Date(p.createdAt).toLocaleString()}
                  </button>
                  <span className={`badge status-${p.status}`}>{p.status}</span>
                </div>
                {p.notes && <div className="muted small">{p.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
