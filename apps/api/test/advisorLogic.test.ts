import { describe, expect, it } from "vitest";
import { buildAdvisorContext, MAX_CONTEXT_CHARS, SAFETY_INSTRUCTIONS } from "../src/advisor/context.js";
import { isOutOfScope } from "../src/advisor/scopeGuard.js";
import { summarize } from "../src/lib/nutrition.js";
import type { Profile } from "../src/profile/profile.js";

describe("isOutOfScope", () => {
  it.each([
    "What should I eat to reduce Ozempic nausea?",
    "What is the right metformin dose with breakfast?",
    "Best diet to treat my diabetes",
    "Is this safe while pregnant?",
    "I have symptoms of reflux, what should I eat?",
    "Can GLP-1 side effects be helped with food?",
    "Which supplements to cure fatigue?",
  ])("blocks %j", (q) => expect(isOutOfScope(q)).toBe(true));

  it.each([
    "Give me a high-protein vegetarian snack idea",
    "How can I add more fiber to breakfast?",
    "What should I have for dinner tonight?",
    "Is oatmeal a good source of protein?",
    "Suggest a healthy sweet treat",
    "Is cured ham high in salt?",
    "Recipe ideas for dosa with more protein",
  ])("allows %j", (q) => expect(isOutOfScope(q)).toBe(false));
});

const profile: Profile = {
  goal: "more_protein",
  dailyCalorieTarget: 2000,
  dietPreferences: ["vegetarian"],
  avoidFoods: ["peanuts"],
  updatedAt: "2026-10-28T00:00:00.000Z",
};

const entries = [
  { foodName: "Dry Oatmeal", calories: 307 },
  { foodName: "Mystery stew", calories: null },
];
const summary = summarize([
  { calories: 307, proteinG: 10.7, carbohydratesG: 54.8, fatG: 5.3 },
  { calories: null, proteinG: null, carbohydratesG: null, fatG: null },
]);

describe("buildAdvisorContext", () => {
  it("puts safety instructions first, then profile, then today's log", () => {
    const ctx = buildAdvisorContext({ profile, entries, summary, date: "2026-10-28", history: [] });
    expect(ctx.startsWith(SAFETY_INSTRUCTIONS)).toBe(true);
    const iProfile = ctx.indexOf("User profile");
    const iToday = ctx.indexOf("Logged today");
    expect(iProfile).toBeGreaterThan(0);
    expect(iToday).toBeGreaterThan(iProfile);
    expect(ctx).toContain("Goal: Eat more protein");
    expect(ctx).toContain("Diet preferences: Vegetarian");
    expect(ctx).toContain("Avoid: peanuts");
    expect(ctx).toContain("Dry Oatmeal: 307 kcal");
    expect(ctx).toContain("Mystery stew: calories not available");
  });

  it("flags partial totals instead of presenting them as complete", () => {
    const ctx = buildAdvisorContext({ profile, entries, summary, date: "2026-10-28", history: [] });
    expect(ctx).toContain("calories 307 kcal (partial: 1 entries missing)");
  });

  it("says when nothing is set or logged", () => {
    const empty: Profile = { goal: "balanced", dailyCalorieTarget: null, dietPreferences: [], avoidFoods: [], updatedAt: null };
    const ctx = buildAdvisorContext({ profile: empty, entries: [], summary: summarize([]), date: "2026-10-28", history: [] });
    expect(ctx).toContain("Daily calorie target: not set");
    expect(ctx).toContain("Avoid: nothing specified");
    expect(ctx).toContain("Logged today (2026-10-28): 0 entries");
  });

  it("includes history and drops the oldest turns first when over the cap", () => {
    const long = "x".repeat(600);
    const history = [
      { question: "first question", answer: long },
      { question: "second question", answer: long },
      { question: "third question", answer: long },
    ];
    const small = buildAdvisorContext({ profile, entries, summary, date: "2026-10-28", history: history.slice(2) });
    expect(small).toContain("Q: third question");

    const many = Array.from({ length: 3 }, () => ({ question: "q".repeat(500), answer: long }));
    many[2] = { question: "latest", answer: "short answer" };
    const ctx = buildAdvisorContext({ profile, entries, summary, date: "2026-10-28", history: many });
    expect(ctx.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(ctx).toContain("Q: latest");
    expect(ctx.startsWith(SAFETY_INSTRUCTIONS)).toBe(true);
  });

  it("truncates long history answers", () => {
    const ctx = buildAdvisorContext({ profile, entries, summary, date: "2026-10-28", history: [{ question: "q", answer: "y".repeat(900) }] });
    expect(ctx).toContain(`${"y".repeat(600)}…`);
    expect(ctx).not.toContain("y".repeat(601));
  });
});
