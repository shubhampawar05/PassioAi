# Design

## Context

This change requires `add-nutrition-profile-and-advisor` (the profile, `isOutOfScope`, and a guidance provider sharing `PassioClient`) and `add-label-and-camera-barcode-scan` (the input-types requirement) to be implemented first. See proposal.md for motivation.

### Live verification (2026-10-28)

Full responses are in `evidence/`.

| Route (POST, `/v2/products/napi/tools/…`) | Body sent | Live response shape | Time / tokens |
|---|---|---|---|
| `generateMealPlanPreview` | `{content: "Generate a 2 day meal plan. Goal: more protein. Daily calories about 2000 kcal. Diet: vegetarian. Avoid: peanuts. Meals: breakfast, lunch, dinner."}` | `{constraints: {constraints: {avoid, calories, days, diet, goal}, macros: {calories, protein, fiber, carbs, fat}}, mealPlanDays: [{breakfast\|lunch\|dinner\|snack: {recipes: [{name, rejected}]}}]}`. This **differs from the docs** (`[{day, meals: [{mealName, rejected}]}]`). A snack slot was added even though it was not requested. | 4.0 s / 4,996 |
| `generateMealPlanPreview` (regenerate) | `{content: JSON.stringify(preview with day1 dinner rejected: true)}` | Same shape. Only day 1 dinner changed; names came back lower-cased. | 2.4 s / 5,286 |
| `generateMealPlan` | `{content: JSON.stringify(approved preview)}` | `{constraints, mealPlanDays: [{<slot>: {recipes: [{name, ingredients[], preparation, macros {calories, protein, fiber, carbs, fat}}]}, macros {…}}], shoppingList: [{name, portionQuantity, portionSize}]}`. Ingredients are search-result objects (`displayName`, `refCode`, `nutritionPreview`, …). 48 KB for 2 days. | **14 s / 132,618** |
| `humanizeShoppingList` | `{content: "strawberry, 400, grams\n…"}` | `{items: [{name, shoppingName, quantity, unit, cookingStateAdjusted, notes}]}` | 3.0 s / 2,570 |

## Goals / Non-Goals

**Goals:**
- Keep raw Passio plan JSON on the server, so regenerate, approve, and log requests never trust client-provided plan data.
- Make the long-running generation robust (background job, polling, restart safety) even though the live run was fast.

**Non-Goals:**
- `regenerateMeals`, `updateMealPlanShoppingList` (bodies undocumented), affiliate links, and `?model=` model selection (Growth/Pro plan feature; not needed).
- Editing recipes, or tracking a plan against what was eaten (beyond one-click logging).

## Decisions

1. **Provider methods on `NutritionGuidanceProvider`:** `previewMealPlan(content)`, `generateMealPlan(content)`, and `humanizeShoppingList(content)`. A mock implementation returns `[MOCK]` plans. Zod schemas are loose and match the live shapes:
   - Validated: `mealPlanDays` as an array of objects whose values are `{recipes: [...]}` (the day-level `macros` key is excluded by name), recipe `name`, and optional `ingredients`, `preparation`, `macros`.
   - Unknown slots are kept in display order: breakfast, lunch, dinner, snack, then any others.

2. **Prompt content.** `buildMealPlanContent(profile, days, notes)` produces plain text. It starts with the same safety instruction block as the advisor, followed by: "Generate a {days} day meal plan. Goal: … Daily calories about … (omitted if not set). Diet: … Avoid: … Meals: breakfast, lunch, dinner, snack. Notes: …".
   - `notes` pass through `isOutOfScope` first.
   - Regenerate and approve send `JSON.stringify(storedPreview)` with the requested `rejected` flags, as in the live test.

3. **Persistence.** Prisma model `MealPlan`:
   - `id` (UUID), `demo_user_id`, `status` (enum `preview | generating | ready | failed`), `days`, `notes`, `profile_snapshot` (json), `preview_payload` (json), `plan_payload` (json, nullable), `shopping_list_humanized` (json, nullable), `error_code` (nullable), `created_at`, `updated_at`.
   - Index on (`demo_user_id`, `created_at` DESC).
   - Before `plan_payload` is stored, each ingredient is minimized to `displayName`, `refCode`, `nutritionPreview` (about 70% smaller). The raw provider response is not otherwise stored.

4. **Background generation.**
   - `POST /api/meal-plans/:id/approve` sets status `generating` (409 unless `preview` or `failed`), starts an in-process promise (`jobs.run(planId)`), and returns 202.
   - The job calls `generateMealPlan` with a 480 s timeout and writes `ready` + payload, or `failed` + mapped error code.
   - On API startup, `UPDATE meal_plans SET status='failed', error_code='INTERRUPTED' WHERE status='generating'`.
   - The client polls `GET /api/meal-plans/:id` every 3 s while generating, with an elapsed timer and a cancel-polling button.
   - An external queue was rejected as unnecessary for a single-instance POC.

5. **Normalized API shape.** `GET /api/meal-plans/:id` returns `{id, status, dayCount, createdAt, errorCode, constraints, days: [{day, macros, meals: [{slot, recipes: [{index, name, rejected, ingredients?, preparation?, macros?}]}]}], shoppingList, shoppingListHumanized}`. Macros map `calories/protein/carbs/fat/fiber` to numbers or null.

6. **Logging a recipe.** `POST /api/meal-plans/:id/log` takes `{day, slot, index}`.
   - The server reads the stored recipe and creates a `FoodLogEntry`: `inputType: meal_plan`, `foodName`: the recipe name in title case, `servingUnit: "1 recipe"`, `quantity: 1`, per-serving values = recipe macros (null when absent), `provider: "passio"`, `inputSummary: "meal plan {shortId} day {d} {slot}"`.
   - It reuses `scaleNutrients`, so totals are rounded to 1 decimal place. The `meal_plan` enum value is added by migration.

7. **Cost visibility.** Before approval, the UI shows "Full plans are expensive (≈130k tokens for 2 days in testing)". `days` is limited to 7. There are no automatic retries.

8. **Safety and labeling.** A shared `GeneralGuidanceNotice` component (introduced with the advisor) is shown on every plan view, with added allergy wording. Plans are generated only from the non-medical profile fields.

9. **As built (2026-10-28).**
   - `POST /api/food-logs` still does not accept `meal_plan`. Those entries are created only by `POST /api/meal-plans/:id/log`, so the client can never supply nutrient values for a planned meal.
   - Every plan response carries `source` (`passio` or `mock`, from the provider mode). Entries logged in mock mode are stored with provider `mock`.
   - The job runner exposes `idle()` so tests can await background generation deterministically.
   - Live browser run: the preview took 2.7 s, regenerating one meal changed only that meal, the full plan took 16.3 s, "Log this meal" added a 430.2 kcal entry to the dashboard, and the humanized shopping list replaced the raw one.

## Risks / Trade-offs

- [The response shape already differs from the docs and may change again] → Loose schemas, live fixtures in tests, and `PROVIDER_BAD_RESPONSE` on mismatch with no partial rendering.
- [High token cost of full plans] → Explicit approval step, a cost note, a day limit, and no retries.
- [In-process jobs are lost on restart] → Marked `INTERRUPTED` on startup. The user can re-approve.
- [The plan may include avoided foods] → The allergy notice. The avoid list is sent in the prompt. The app makes no allergen-safety claims.
- [Name casing changes on regenerate] → Title-case recipe names for display.

## Migration Plan

Two additive migrations: the `meal_plans` table with its status enum, and the `meal_plan` value on `InputType`. Rollback means dropping the table; logged entries keep the `meal_plan` input type and remain valid.
