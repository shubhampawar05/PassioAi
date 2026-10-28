# Tasks

## 1. Data and provider

- [x] 1.1 Add the Prisma `MealPlan` model, status enum, and `meal_plan` on `InputType`, with migrations; verify `npm run db:migrate` on the dev and test databases
- [x] 1.2 Add zod schemas for the live preview, full-plan, and humanize shapes, plus normalizers (slot ordering, macros to number or null, ingredient minimization, title-case names); verify unit tests against the copied `evidence/*.live.json` fixtures, including the day-level `macros` key and a recipe with missing fat
- [x] 1.3 Add `previewMealPlan`, `generateMealPlan`, and `humanizeShoppingList` to `NutritionGuidanceProvider` (Passio, mock, unconfigured); verify mocked-fetch tests for routes, bodies, a 480 s timeout, and error mapping
- [x] 1.4 Implement `buildMealPlanContent` (safety block, profile, days, slots, notes); verify unit tests for content, an omitted calorie target, and out-of-scope notes rejected

## 2. API

- [x] 2.1 Implement `POST /api/meal-plans` (preview), `GET /api/meal-plans`, `GET /api/meal-plans/:id`, and `DELETE /api/meal-plans/:id`; verify Supertest with a fake provider for create, validation, 422 notes, list order, 404, and delete keeping logged entries
- [x] 2.2 Implement `POST /api/meal-plans/:id/regenerate` (preview only, rejected flags applied to the stored preview); verify that 409 is returned in the wrong state and that the stored payload is replaced
- [x] 2.3 Implement the job runner, `POST /api/meal-plans/:id/approve` (202), and startup recovery marking `generating` as `INTERRUPTED`; verify tests for the success transition, failure code, timeout, re-approve after failure, and startup recovery
- [x] 2.4 Implement `POST /api/meal-plans/:id/shopping-list/humanize` and `POST /api/meal-plans/:id/log`; verify that logging creates a `meal_plan` entry with server-side macros (370.2 kcal from the fixture), appears in the nutrition summary, and returns 409 or 404 for invalid states or targets

## 3. Web

- [x] 3.1 Build the Meal plans list and the "New plan" form (days 1–7, notes, profile summary with an edit link); verify in the browser
- [x] 3.2 Build the preview editor (meals by day and slot, reject toggles, regenerate, approve with a cost note); verify against real Passio that regenerate changes only the rejected meals
- [x] 3.3 Build the generating state (3 s polling, elapsed time, failure with retry) and the ready view (recipes, ingredients, preparation, macros with "Not available", day totals, shopping list, humanize button, "Log this meal"); verify in the browser that a logged meal appears on the dashboard
- [x] 3.4 Show the general-suggestion and allergy notice on every plan view; verify with a component test

## 4. Docs and verification

- [x] 4.1 Update the README (feature table, token costs, background generation, manual checklist); verify the instructions as written
- [x] 4.2 Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run smoke`, plus one live 2-day plan end to end in Docker; confirm all pass

## Workflow follow-up

- Implement and archive after `add-label-and-camera-barcode-scan` and `add-nutrition-profile-and-advisor`, so the MODIFIED `Supported entry input types` requirement exists in the main food-log spec.
