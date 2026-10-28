# Spec Delta

## MODIFIED Requirements

### Requirement: Supported entry input types
Each stored entry SHALL record how it was captured, as one of `photo`, `text`, `barcode`, `voice`, `label`, or `meal_plan`. An entry with any other input type SHALL be rejected.

#### Scenario: Label entry saved
- **WHEN** the client saves a confirmed label-scan result with `inputType=label`
- **THEN** the system responds 201 and the entry is listed with input type `label`

#### Scenario: Unknown input type
- **WHEN** the client saves an entry with `inputType=fax`
- **THEN** the system responds 400 with `VALIDATION_ERROR` and nothing is stored

#### Scenario: Meal-plan entry listed
- **WHEN** a meal is logged from a meal plan
- **THEN** the entry is listed with input type `meal_plan`

## ADDED Requirements

### Requirement: Log a meal from a saved plan
The system SHALL create a food-log entry from a recipe in a `ready` meal plan via `POST /api/meal-plans/:id/log`, given day number, slot, and recipe index. The entry's food name, serving "1 recipe", and nutrients SHALL come from the stored Passio recipe macros on the server, never from client-supplied values.

#### Scenario: Recipe logged
- **WHEN** the user logs day 1 breakfast from a ready plan whose recipe macros are 370.2 kcal and 48.1 g protein
- **THEN** the system responds 201 with an entry of input type `meal_plan`, quantity 1, and totals of 370.2 kcal and 48.1 g protein, and the daily summary includes it

#### Scenario: Plan not ready or recipe missing
- **WHEN** the plan is not `ready`, or the day, slot, or index does not exist
- **THEN** the system responds 409 `INVALID_STATE` or 404 `NOT_FOUND` respectively, and nothing is stored
