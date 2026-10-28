import { useEffect, useState } from "react";
import { api, ApiError, type DietPreference, type Goal, type Profile } from "../lib/api";
import { ErrorBox, Spinner } from "./common";

export const GOAL_LABELS: Record<Goal, string> = {
  balanced: "Balanced, varied eating",
  more_protein: "Eat more protein",
  more_fiber: "Eat more fiber",
  more_vegetables: "Eat more vegetables",
  steady_energy: "Steady energy through the day",
};

export const DIET_LABELS: Record<DietPreference, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  halal: "Halal",
  kosher: "Kosher",
};

const MAX_AVOID = 10;

export function ProfileView({ onSaved }: { onSaved?: (p: Profile) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState("");
  const [avoidInput, setAvoidInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then(
      (p) => {
        setProfile(p);
        setTarget(p.dailyCalorieTarget === null ? "" : String(p.dailyCalorieTarget));
      },
      (e: unknown) => setLoadError(e instanceof ApiError ? e.message : "Could not load profile"),
    );
  }, []);

  if (loadError) return <ErrorBox message={loadError} />;
  if (!profile) return <Spinner label="Loading profile…" />;

  const targetNum = target.trim() === "" ? null : Number(target);
  const targetValid = targetNum === null || (Number.isInteger(targetNum) && targetNum >= 1200 && targetNum <= 4000);
  const update = (patch: Partial<Profile>) => {
    setProfile({ ...profile, ...patch });
    setSaved(false);
  };

  const addAvoid = () => {
    const v = avoidInput.trim().toLowerCase();
    if (!v || v.length > 40 || profile.avoidFoods.includes(v) || profile.avoidFoods.length >= MAX_AVOID) return;
    update({ avoidFoods: [...profile.avoidFoods, v] });
    setAvoidInput("");
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const p = await api.saveProfile({
        goal: profile.goal,
        dailyCalorieTarget: targetNum,
        dietPreferences: profile.dietPreferences,
        avoidFoods: profile.avoidFoods,
      });
      setProfile(p);
      setSaved(true);
      onSaved?.(p);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Nutrition profile</h2>
      <p className="muted small">
        Demo data only. Used as context for the advisor and meal plans, and sent to Passio with each request. It
        intentionally does not ask about age, weight, health conditions, or medications.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (targetValid) void save();
        }}
      >
        <label htmlFor="goal">Goal</label>
        <select id="goal" value={profile.goal} onChange={(e) => update({ goal: e.target.value as Goal })}>
          {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
            <option key={g} value={g}>
              {GOAL_LABELS[g]}
            </option>
          ))}
        </select>

        <label htmlFor="target">Daily calorie target (optional, 1200–4000 kcal)</label>
        <input
          id="target"
          type="number"
          min={1200}
          max={4000}
          step={50}
          value={target}
          aria-invalid={!targetValid}
          onChange={(e) => {
            setTarget(e.target.value);
            setSaved(false);
          }}
        />
        {!targetValid && <p className="field-error">Enter a whole number between 1200 and 4000, or leave it empty.</p>}

        <fieldset className="checks">
          <legend>Diet preferences</legend>
          {(Object.keys(DIET_LABELS) as DietPreference[]).map((d) => (
            <label key={d} className="checkbox">
              <input
                type="checkbox"
                checked={profile.dietPreferences.includes(d)}
                disabled={!profile.dietPreferences.includes(d) && profile.dietPreferences.length >= 5}
                onChange={(e) =>
                  update({
                    dietPreferences: e.target.checked
                      ? [...profile.dietPreferences, d]
                      : profile.dietPreferences.filter((x) => x !== d),
                  })
                }
              />
              {DIET_LABELS[d]}
            </label>
          ))}
        </fieldset>

        <label htmlFor="avoid">Foods to avoid (up to {MAX_AVOID})</label>
        <div className="row">
          <input
            id="avoid"
            type="text"
            maxLength={40}
            value={avoidInput}
            placeholder="e.g. peanuts"
            onChange={(e) => setAvoidInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAvoid();
              }
            }}
          />
          <button type="button" className="btn secondary" onClick={addAvoid} disabled={profile.avoidFoods.length >= MAX_AVOID}>
            Add
          </button>
        </div>
        <ul className="chips" aria-label="Foods to avoid">
          {profile.avoidFoods.map((f) => (
            <li key={f} className="chip">
              {f}
              <button type="button" aria-label={`Remove ${f}`} onClick={() => update({ avoidFoods: profile.avoidFoods.filter((x) => x !== f) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Avoided foods are passed to Passio as preferences; always check ingredients for allergies.</p>

        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving || !targetValid}>
            {saving ? "Saving…" : "Save profile"}
          </button>
          {saved && (
            <span className="success inline" role="status">
              Saved.
            </span>
          )}
        </div>
        {saveError && <ErrorBox message={saveError} />}
      </form>
    </section>
  );
}
