import { describe, expect, it } from "vitest";
import { SAFETY_INSTRUCTIONS } from "../src/advisor/context.js";
import { buildMealPlanContent } from "../src/mealPlans/content.js";
import type { Profile } from "../src/profile/profile.js";

const profile: Profile = { goal: "more_protein", dailyCalorieTarget: 2000, dietPreferences: ["vegetarian"], avoidFoods: ["peanuts"], updatedAt: null };

describe("buildMealPlanContent", () => {
  it("starts with the safety block and includes profile, days, slots, and notes", () => {
    const c = buildMealPlanContent(profile, 2, "quick weekday lunches");
    expect(c.startsWith(SAFETY_INSTRUCTIONS)).toBe(true);
    expect(c).toContain("Generate a 2 day meal plan.");
    expect(c).toContain("Goal: Eat more protein.");
    expect(c).toContain("Daily calories about 2000 kcal.");
    expect(c).toContain("Diet: Vegetarian.");
    expect(c).toContain("Avoid: peanuts.");
    expect(c).toContain("Meals: breakfast, lunch, dinner, snack.");
    expect(c).toContain("Notes: quick weekday lunches");
  });

  it("omits the calorie target and notes when not set", () => {
    const c = buildMealPlanContent({ ...profile, dailyCalorieTarget: null, dietPreferences: [], avoidFoods: [] }, 3, null);
    expect(c).not.toMatch(/Daily calories/);
    expect(c).not.toMatch(/Notes:/);
    expect(c).toContain("Diet: no specific diet.");
    expect(c).toContain("Avoid: nothing specified.");
  });

  it("rejects out-of-scope notes", () => {
    expect(() => buildMealPlanContent(profile, 3, "meals that work with my Wegovy dose")).toThrow(/qualified health professional/);
  });
});
