# meal-plans Specification

## Purpose

Lets the demo user generate, refine, approve, view, and delete short meal plans from Passio that reflect their nutrition profile, including recipes, Passio-provided macros, and a shopping list.

## Requirements

### Requirement: Generate a meal-plan preview
The system SHALL create a meal-plan draft via `POST /api/meal-plans`. The request has `days` (integer 1–7, default 3) and optional `notes` (up to 300 characters). The system SHALL call Passio's meal-plan preview using the stored profile and notes, persist the draft, and return it with status `preview`, its id, and meal names grouped by day and meal slot.

#### Scenario: Preview created
- **WHEN** a vegetarian profile that avoids peanuts requests a 2-day plan
- **THEN** the system responds 201 with status `preview` and 2 days, each listing named meals for its slots, every meal with `rejected: false`

#### Scenario: Invalid request
- **WHEN** `days` is 0 or 8, or `notes` exceeds 300 characters
- **THEN** the system responds 400 with `VALIDATION_ERROR` and Passio is not called

#### Scenario: Out-of-scope notes
- **WHEN** `notes` mention medication or other topics blocked by the advisor scope guard
- **THEN** the system responds 422 with `ADVISOR_OUT_OF_SCOPE` and Passio is not called

### Requirement: Regenerate rejected meals
While a plan is in `preview` status, the system SHALL accept a list of meals to reject (day number, slot, recipe index). It SHALL resend the stored preview to Passio with those meals marked rejected, and replace the draft with Passio's result.

#### Scenario: One meal rejected
- **WHEN** the user rejects day 1 dinner and regenerates
- **THEN** the returned preview has a different day 1 dinner and the other meals unchanged, as returned by Passio

#### Scenario: Plan not in preview
- **WHEN** a regenerate request targets a plan that is generating, ready, or failed
- **THEN** the system responds 409 with `INVALID_STATE`

### Requirement: Generate the full plan in the background
When the user approves a preview, the system SHALL start full-plan generation and respond 202 with status `generating`. It SHALL then call Passio's full meal-plan route asynchronously. On success, the plan becomes `ready` and holds recipes, ingredients, preparation text, per-recipe and per-day macros, and the shopping list. On failure or timeout, it becomes `failed` with an error code.

#### Scenario: Generation succeeds
- **WHEN** the user approves a preview and polls `GET /api/meal-plans/:id`
- **THEN** the status moves from `generating` to `ready`, and the plan shows each recipe's name, ingredients, preparation, and Passio macros

#### Scenario: Generation fails
- **WHEN** Passio returns an error or does not finish within 8 minutes
- **THEN** the plan status becomes `failed` with the mapped provider error code, and the user can retry approval

#### Scenario: API restarts mid-generation
- **WHEN** the API restarts while a plan is `generating`
- **THEN** on startup that plan is marked `failed` with code `INTERRUPTED`

### Requirement: Plan nutrition comes only from Passio
Recipe and day macros SHALL be shown exactly as Passio returned them (rounded for display). A missing value SHALL be shown as "Not available". The app SHALL NOT compute or invent calorie targets or recommendations.

#### Scenario: Recipe missing fat
- **WHEN** a recipe's macros omit fat
- **THEN** that recipe shows fat as "Not available"

### Requirement: Shopping list
A ready plan SHALL show its shopping list as returned by Passio. On request, the system SHALL convert it into shopping-friendly names and quantities via Passio's humanize route and store the result with the plan.

#### Scenario: Humanize list
- **WHEN** the user selects "Make shopping-friendly" on a ready plan
- **THEN** the plan shows items such as "Fresh Strawberries, 1 pound" with Passio's notes

### Requirement: List, view, and delete plans
The system SHALL list the demo user's plans, newest first, with status, days, and creation time. It SHALL return one plan by id, and delete a plan by id. Deleting a plan SHALL NOT delete food-log entries already logged from it.

#### Scenario: Delete a plan
- **WHEN** the user deletes a ready plan from which one meal was logged
- **THEN** the plan no longer appears in the list, and the logged entry remains in the diary

### Requirement: Meal plans are labeled as general suggestions
Every plan view SHALL state that the plan is general, AI-generated meal inspiration from Passio, may be inaccurate, does not account for medical needs, and that ingredients must be checked for allergies.

#### Scenario: Plan shown
- **WHEN** any preview or ready plan is displayed
- **THEN** the general-suggestion and allergy notice is visible
