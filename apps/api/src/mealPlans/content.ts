import { SAFETY_INSTRUCTIONS } from "../advisor/context.js";
import { isOutOfScope, OUT_OF_SCOPE_MESSAGE } from "../advisor/scopeGuard.js";
import { AppError } from "../errors.js";
import { DIET_PREFERENCES, GOALS, type Profile } from "../profile/profile.js";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * Prompt for Passio's meal-plan preview (plain text, as in the live test).
 * Notes pass through the advisor scope guard first.
 */
export function buildMealPlanContent(profile: Profile, days: number, notes: string | null): string {
  if (notes && isOutOfScope(notes)) throw new AppError("ADVISOR_OUT_OF_SCOPE", OUT_OF_SCOPE_MESSAGE);
  const diets = profile.dietPreferences.map((d) => DIET_PREFERENCES[d]).join(", ");
  const parts = [
    SAFETY_INSTRUCTIONS,
    "",
    `Generate a ${days} day meal plan.`,
    `Goal: ${GOALS[profile.goal]}.`,
    profile.dailyCalorieTarget === null ? null : `Daily calories about ${profile.dailyCalorieTarget} kcal.`,
    `Diet: ${diets || "no specific diet"}.`,
    `Avoid: ${profile.avoidFoods.join(", ") || "nothing specified"}.`,
    `Meals: ${MEAL_SLOTS.join(", ")}.`,
    notes ? `Notes: ${notes}` : null,
  ];
  return parts.filter((p) => p !== null).join("\n");
}
