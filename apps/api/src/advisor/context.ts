import { type DailySummary, NUTRIENT_KEYS, type NutrientKey } from "../lib/nutrition.js";
import { DIET_PREFERENCES, GOALS, type Profile } from "../profile/profile.js";

/** Sent first on every guidance request (advisor and meal plans). */
export const SAFETY_INSTRUCTIONS =
  "You are a general nutrition information assistant for a demo app. Give general, non-medical food and nutrition information only. " +
  "Do not give medical advice, diagnose, discuss medications or supplements as treatment, or set clinical targets. " +
  "Respect the diet preferences and never suggest foods listed under 'Avoid'. " +
  "If asked a medical question, recommend a qualified health professional.";

export const MAX_CONTEXT_CHARS = 4000;
const MAX_HISTORY_ANSWER_CHARS = 600;

export type AdvisorTurn = { question: string; answer: string };
export type TodayEntry = { foodName: string; calories: number | null };

const LABELS: Record<NutrientKey, [string, string]> = {
  calories: ["calories", "kcal"],
  proteinG: ["protein", "g"],
  carbohydratesG: ["carbohydrates", "g"],
  fatG: ["fat", "g"],
};

export function profileLines(profile: Profile): string[] {
  const diets = profile.dietPreferences.map((d) => DIET_PREFERENCES[d]).join(", ") || "none";
  return [
    "User profile (demo):",
    `- Goal: ${GOALS[profile.goal]}`,
    `- Daily calorie target: ${profile.dailyCalorieTarget === null ? "not set" : `${profile.dailyCalorieTarget} kcal`}`,
    `- Diet preferences: ${diets}`,
    `- Avoid: ${profile.avoidFoods.join(", ") || "nothing specified"}`,
  ];
}

function todayLines(entries: TodayEntry[], summary: DailySummary, date: string): string[] {
  const lines = [`Logged today (${date}): ${entries.length} entries`];
  for (const e of entries) {
    lines.push(`- ${e.foodName}: ${e.calories === null ? "calories not available" : `${e.calories} kcal`}`);
  }
  const totals = NUTRIENT_KEYS.map((k) => {
    const s = summary.nutrients[k];
    const [label, unit] = LABELS[k];
    if (summary.entryCount > 0 && s.contributingEntries === 0) return `${label} not available`;
    const partial = s.missingEntries > 0 ? ` (partial: ${s.missingEntries} entries missing)` : "";
    return `${label} ${s.total} ${unit}${partial}`;
  });
  lines.push(`Today's totals: ${totals.join("; ")}`);
  return lines;
}

function historyBlock(history: AdvisorTurn[]): string {
  if (history.length === 0) return "";
  const turns = history.map((h) => {
    const a = h.answer.length > MAX_HISTORY_ANSWER_CHARS ? `${h.answer.slice(0, MAX_HISTORY_ANSWER_CHARS)}…` : h.answer;
    return `Q: ${h.question}\nA: ${a}`;
  });
  return `Earlier in this conversation:\n${turns.join("\n")}`;
}

/**
 * Passio `message` context: safety instructions, profile, today's log, then
 * history. Capped at MAX_CONTEXT_CHARS, dropping the oldest history first.
 */
export function buildAdvisorContext(input: {
  profile: Profile;
  entries: TodayEntry[];
  summary: DailySummary;
  date: string;
  history: AdvisorTurn[];
}): string {
  const base = [SAFETY_INSTRUCTIONS, profileLines(input.profile).join("\n"), todayLines(input.entries, input.summary, input.date).join("\n")].join("\n\n");
  let history = [...input.history];
  let text = history.length ? `${base}\n\n${historyBlock(history)}` : base;
  while (text.length > MAX_CONTEXT_CHARS && history.length > 0) {
    history = history.slice(1);
    text = history.length ? `${base}\n\n${historyBlock(history)}` : base;
  }
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…` : text;
}
