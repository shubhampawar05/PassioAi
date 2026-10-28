# Spec Delta

## Purpose

Stores a small, non-medical demo nutrition profile (goal, calorie target, diet preferences, foods to avoid) that personalizes advisor answers and meal plans.

## ADDED Requirements

### Requirement: View the demo profile
The system SHALL return the demo user's profile via `GET /api/profile`. If none has been saved, it SHALL return the defaults: goal `balanced`, no calorie target, no diet preferences, no foods to avoid, and `updatedAt: null`.

#### Scenario: No profile saved yet
- **WHEN** the client requests the profile before one has been saved
- **THEN** the system responds 200 with the default profile and `updatedAt` null

### Requirement: Update the demo profile
The system SHALL replace the profile via `PUT /api/profile`.
- `goal` is one of `balanced`, `more_protein`, `more_fiber`, `more_vegetables`, `steady_energy`.
- `dailyCalorieTarget` is null or an integer from 1200 to 4000.
- `dietPreferences` is up to 5 of `vegetarian`, `vegan`, `pescatarian`, `gluten_free`, `dairy_free`, `halal`, `kosher`.
- `avoidFoods` is up to 10 items of 1–40 characters each.

#### Scenario: Valid update
- **WHEN** the client saves goal `more_protein`, target 2000, diet `vegetarian`, and avoid `["peanuts"]`
- **THEN** the system responds 200 with the stored profile and a non-null `updatedAt`, and a later `GET` returns the same values

#### Scenario: Invalid update
- **WHEN** the client sends target 500, an unknown goal, an unknown diet preference, or 11 avoid items
- **THEN** the system responds 400 with `VALIDATION_ERROR` and the stored profile is unchanged

### Requirement: Profile holds no health data
The profile SHALL NOT accept or store age, sex, body measurements, medical conditions, medications, or pregnancy status. Unknown fields SHALL be ignored.

#### Scenario: Extra health fields sent
- **WHEN** the client includes `"medications": ["metformin"]` and `"weightKg": 80` in a profile update
- **THEN** those fields are not stored and are absent from the response
