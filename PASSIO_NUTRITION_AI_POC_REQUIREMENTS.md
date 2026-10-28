# Passio Nutrition AI --- Web App POC Requirements

## 1. Project overview

Build a working demo web application that lets a user log food using
Passio Nutrition AI and view nutrition information and a daily summary.

This is a technical proof of concept (POC), not a production healthcare
application. The main goal is to verify the Passio integration and
demonstrate the end-to-end flow.

**Important context** - Passio Nutrition AI is the external
food-recognition/nutrition service. - The application owns its user
experience, backend, and food-log persistence. Do not assume Passio
stores our users' food history. - Use test/demo data only. Do not use
real patient data or PHI. - The POC should focus on working
functionality, not production-grade visual polish or clinical logic. -
Use the official Passio documentation to verify current capabilities,
endpoints, SDK requirements, authentication, and response schemas before
implementing: https://passio.gitbook.io/nutrition-ai - Do not invent API
endpoints, request fields, response fields, or SDK methods. If access to
a feature is not available for the account or selected platform,
document that limitation and implement the best supported fallback.

## 2. Development workflow --- OpenSpec is mandatory

This project uses OpenSpec for spec-driven development. Do not
immediately start coding the entire application.

1.  Inspect the existing repository, current stack, package manager,
    conventions, and any existing OpenSpec configuration.
2.  Check the installed OpenSpec CLI version and use its current
    commands/help. Do not assume command syntax if it differs from the
    installed version.
3.  Create an OpenSpec change proposal for this POC.
4.  Define/update the relevant specs, design document, and
    implementation tasks using the repository's OpenSpec workflow.
5.  Make the proposal/design/tasks specific enough to implement and
    test.
6.  Review the change artifacts for completeness and consistency before
    coding.
7.  Implement the approved change in small, verifiable steps, updating
    task completion as work progresses.
8.  Run tests, linting, type checking, and a Docker-based smoke test.
    Report any blockers honestly.
9.  Do not archive or mark the OpenSpec change complete until
    implementation and verification are finished, following the
    repository's OpenSpec conventions.

If the repository is empty, initialize only what is needed for the
chosen stack and OpenSpec. If it already contains an app, adapt it
rather than replacing it without reason.

## 3. Preferred technology and architecture

First inspect the repository. Reuse its existing stack where practical.
If no stack exists, use this default unless Passio's current
documentation proves it incompatible:

-   **Frontend:** React + TypeScript + Vite.
-   **Backend:** Node.js + TypeScript + Express.
-   **Database:** PostgreSQL.
-   **Database runtime:** Docker Compose.
-   **Database access:** Use a typed, migration-capable ORM or query
    layer appropriate to the existing repository (prefer Prisma if there
    is no existing standard).
-   **Validation:** Validate incoming requests and external API
    responses.
-   **Testing:** Unit tests for business logic plus API/integration
    tests for the main food-log flow.

Keep a clear separation between frontend, backend, Passio integration,
persistence, and UI components. Avoid unnecessary services and
overengineering.

Suggested high-level structure (adapt to the repository): - `apps/web`
--- React frontend - `apps/api` --- Express backend - `packages/shared`
--- shared types/schemas if useful - `prisma` or equivalent --- schema
and migrations - `docker-compose.yml` --- PostgreSQL and app services if
appropriate - `.env.example` --- documented environment variables
without secrets - `openspec/` --- OpenSpec change/spec files

A monorepo is optional; choose the simplest maintainable structure.

## 4. Core user experience

Create a clean, responsive demo application with these screens/sections:

### 4.1 Dashboard

-   Show today's date and a daily nutrition summary.
-   Show totals for calories, protein, carbohydrates, and fat when the
    Passio response provides those values.
-   Show the number of meals/log entries for the day.
-   Show recent food entries with food name, time, serving/quantity when
    available, and nutrition details.
-   Provide a clear action to log food.
-   Display a useful empty state when no food has been logged.

### 4.2 Log food

Support the following input methods where the current Passio plan/API
and chosen integration support them:

1.  **Photo:** choose/upload an image of food. If live camera
    recognition is supported in the selected web integration, it may be
    offered as an additional option; do not assume it is supported.
2.  **Text/natural language:** enter a description of food eaten.
3.  **Barcode:** scan a barcode with the camera if supported, and/or
    allow manual barcode entry as a practical fallback.
4.  **Packaging/nutrition label:** investigate whether Passio exposes
    the required functionality through the chosen API/SDK. Only
    implement it if verified in official docs and available to the
    account.
5.  **Voice:** investigate the supported voice input path. If supported,
    allow the user to speak a food description and review/edit the
    transcribed text before submitting. Do not claim Passio performs
    speech recognition unless documentation confirms it.

Do not silently fake an integration. If a feature is not available or
cannot be verified, clearly label it as unavailable/not included in this
POC and record the finding in the OpenSpec artifacts/README.

### 4.3 Recognition result and confirmation

-   Show loading/progress while Passio is processing.
-   Display the recognized food and the nutrition values returned by
    Passio.
-   Show serving size/quantity and nutrient units when returned.
-   Allow the user to correct the food description or retry if
    recognition is wrong, using supported API operations.
-   Let the user confirm and save a result before it appears in the food
    diary.
-   Handle multiple foods in one image only if the chosen Passio
    integration supports it; otherwise handle a single result and
    document the limitation.
-   Do not invent nutrition values. If a field is missing, show "Not
    available" or omit it.
-   Make it clear that nutrition values and portion estimates may be
    approximate.

### 4.4 Food diary

-   List saved entries for the selected day, newest first.
-   Allow viewing an entry's details.
-   Allow deleting an entry.
-   If editing is straightforward, allow editing quantity/serving and
    recalculate totals based on stored nutrition data. Do not claim to
    re-run Passio unless that operation is actually implemented.
-   Persist entries in PostgreSQL; data must remain after the app
    containers restart.

### 4.5 Daily summary

-   Calculate totals from the app's persisted entries, not from a
    hard-coded sample.
-   Sum available calorie, protein, carbohydrate, and fat values.
-   Clearly handle missing values so totals are not misleading.
-   Provide previous/next day navigation if feasible; at minimum,
    today's summary must work.
-   Use a consistent timezone strategy and document it.

### 4.6 Meal plans and nutrition advisor --- investigate, do not assume

The broader Passio offering may include an AI nutrition advisor and
meal-plan features. These are not automatically required for the first
POC. - Check official docs and account access to determine whether they
are exposed via the SDK/API available to this project. - If available
with a clear integration path and time permits, create a separate
optional OpenSpec task/change for a basic demo. - Do not build a fake
advisor, fake meal plan, or ungrounded clinical recommendation. - Keep
these features out of the core acceptance criteria unless verified and
explicitly scoped.

## 5. Passio integration requirements

-   Read the current official Passio docs before choosing SDK vs REST
    API.
-   Compare Web SDK and REST API for the required input modes, web
    support, camera support, response structure, and integration
    complexity.
-   Choose and document the simplest supported integration for this web
    POC.
-   Implement a dedicated backend service/module for Passio calls; keep
    provider-specific code out of UI components.
-   Configure credentials through environment variables. Never commit
    credentials.
-   Prefer backend-mediated requests when supported. Do not expose a
    real API key in browser bundles, client logs, screenshots, or Git.
-   Use the exact authentication method, headers, endpoint, payload, and
    response parsing documented by Passio.
-   Add request timeouts, clear error handling, and safe logging. Do not
    log uploaded image content, credentials, or sensitive user
    information.
-   Handle invalid credentials, quota/rate limits, network errors,
    unsupported inputs, empty results, and malformed provider responses.
-   Normalize the provider response into an internal application type
    before saving or displaying it.
-   Add a small adapter/service boundary so Passio integration can be
    mocked in automated tests.
-   Never invent a successful response when the real API fails. A
    clearly labeled development mock may be used for UI development, but
    it must be opt-in and visibly identified as mock data.
-   Document any features requiring dashboard enablement, account
    permissions, or vendor confirmation.

## 6. Database and data model

Use PostgreSQL running in Docker. Use migrations and a reproducible
development setup.

At minimum, persist food-log entries with fields appropriate to the
verified Passio response: - `id` --- UUID or equivalent primary key -
`demo_user_id` --- simple demo user identifier; full authentication is
out of scope unless the repository already has it - `logged_at` ---
timestamp - `input_type` --- photo, text, barcode, or voice where
implemented - `input_summary` --- safe, short text description; do not
store raw image bytes by default - `food_name` - `serving_quantity` and
`serving_unit`, if available - `calories`, `protein_g`,
`carbohydrates_g`, `fat_g`, nullable when not returned -
`passio_food_id` or provider reference, if returned and useful -
`provider_payload` --- only if needed for debugging; store a
minimized/normalized payload and avoid unnecessary personal data -
`created_at` and `updated_at`

Adjust the schema to actual Passio response fields. Avoid persisting raw
images unless required for the POC and explicitly justified. Do not
store API keys in the database.

Requirements: - Include migrations. - Add indexes for date/time and demo
user lookup as appropriate. - Ensure deleting a food entry removes it
from future totals. - Provide a database health check. - Ensure
`docker compose up --build` (or a clearly documented equivalent) starts
the demo and database. - Include a documented way to run migrations and
optionally seed clearly labeled demo data.

## 7. API design

Design small, validated backend endpoints. Adapt names to repository
conventions; example responsibilities:

-   `GET /api/health` --- application and database health.
-   `POST /api/food-recognition` --- accept one supported input and call
    Passio.
-   `GET /api/food-logs?date=YYYY-MM-DD` --- list entries for a day.
-   `POST /api/food-logs` --- save a user-confirmed normalized nutrition
    result.
-   `GET /api/food-logs/:id` --- retrieve one entry.
-   `DELETE /api/food-logs/:id` --- delete an entry.
-   `GET /api/nutrition-summary?date=YYYY-MM-DD` --- return daily totals
    calculated from persisted entries.

These are proposed application endpoints, not Passio endpoints. Validate
input, set upload size/type limits, return consistent error shapes, and
avoid trusting client-supplied totals without server-side
validation/recalculation.

## 8. Docker and local developer experience

Provide: - `docker-compose.yml` or `compose.yaml`. - PostgreSQL service
with a named volume and health check. - Application service(s) if
consistent with the chosen architecture. - Correct startup
ordering/readiness handling; do not rely only on `depends_on` without
health checks where needed. - `.env.example` with placeholders such as
`PASSIO_API_KEY=`, `DATABASE_URL=`, and appropriate ports. -
`.gitignore` for local environment files, build outputs, node modules,
and generated artifacts. - A README with exact commands for setup,
configuration, migrations, running, testing, and troubleshooting. - No
real secrets in the repository. - Do not assume Docker services can read
a host's `localhost`; use Compose service names for
container-to-container connections.

## 9. UI/UX requirements

-   Responsive desktop and mobile layouts.
-   Simple, polished, accessible interface; prioritize clarity over
    elaborate animations.
-   Clear labels for each supported input method.
-   Show upload/processing progress and disable duplicate submissions
    while processing.
-   Show actionable error messages and retry controls.
-   Handle empty states, no-match results, missing nutrition values, and
    API failures.
-   Make it easy to review a recognized result before saving.
-   Use semantic HTML, keyboard-accessible controls, and sensible focus
    states.
-   Avoid presenting the demo as a medical device or giving clinical
    advice.

## 10. Privacy and safety boundaries

-   Use test accounts and synthetic/demo data only.
-   Do not implement clinical decision support, medication interactions,
    GLP-1 side-effect coaching, diagnosis, or treatment recommendations
    in this POC.
-   Do not send real patient information to Passio.
-   Minimize stored data and do not retain raw food images by default.
-   Do not put secrets in logs or browser code.
-   Clearly describe the demo as informational; nutrition estimates may
    be inaccurate.
-   Any future use with real member data requires a separate privacy,
    security, compliance, consent, data-residency, and vendor review.

## 11. Testing requirements

Add tests appropriate to the repository for: - Nutrition response
normalization, including missing optional fields. - Daily totals
calculations. - Input validation and unsupported file types. - Food-log
create, list, retrieve, and delete. - Date boundaries/timezone
handling. - Passio service errors, timeouts, malformed responses, and
quota errors. - API routes using a mocked Passio service so tests do not
require paid vendor calls. - A basic end-to-end smoke test for the main
flow where feasible.

Provide a manual test checklist: 1. Start the app and database with
Docker. 2. Confirm health endpoint reports app/database status. 3.
Submit a valid supported food input with Passio configured. 4. Verify
recognized nutrition details appear. 5. Confirm and save the result. 6.
Refresh/restart the app and confirm the entry persists. 7. Verify daily
totals update correctly. 8. Delete an entry and confirm the totals
update. 9. Verify invalid input and provider failures produce helpful
errors. 10. Verify no real API key is exposed in frontend assets.

## 12. Acceptance criteria

The POC is complete when: - \[ \] OpenSpec proposal/spec/design/tasks
are created and reflect the actual implementation. - \[ \] The chosen
Passio integration is supported by official docs and the configured
account. - \[ \] At least one primary input flow works end to end
against Passio using test data. - \[ \] Photo, text, and barcode are
implemented if supported by the selected integration; unsupported modes
are documented honestly. - \[ \] A user can review a recognition result
before saving it. - \[ \] Confirmed food logs are stored in
PostgreSQL. - \[ \] Daily calories, protein, carbohydrates, and fat are
calculated from persisted entries when the data is available. - \[ \]
Food entries can be listed and deleted. - \[ \] Database persistence
survives container restart. - \[ \] Docker setup and `.env.example` work
from a clean checkout. - \[ \] Tests, lint, and type checks pass, or
remaining failures are documented. - \[ \] README explains setup,
limitations, test steps, and supported Passio features. - \[ \] No real
patient data is used and no real API key is committed or exposed
client-side.

## 13. Explicitly out of scope for this POC

-   Production deployment and production UI polish.
-   Real patient/member data and production
    authentication/authorization.
-   Clinical logic, diagnosis, treatment advice, or drug--food
    interactions.
-   Novo Nordisk content-library integration unless separately
    requested.
-   Wearable/Apple Health integrations.
-   Payment/billing.
-   Production-grade analytics and monitoring.
-   Building a custom food-recognition model or nutrition database.
-   Assuming meal plans or the AI advisor are included without verifying
    current Passio API/SDK availability.

## 14. Instructions to Claude Code

Work as a senior full-stack engineer and follow the repository's
OpenSpec workflow.

Start by inspecting the repository, OpenSpec setup, and current Passio
documentation. Then create the OpenSpec change artifacts before
implementing the feature. Resolve uncertainties by documenting them and
choosing the simplest verified approach; do not fabricate vendor
capabilities. Implement incrementally, run checks, and keep OpenSpec
tasks and README current.

At the end, report: 1. What was implemented. 2. Which Passio input
methods actually work and which were unavailable/unverified. 3. The
exact Docker startup and migration commands. 4. Required environment
variables (never print secret values). 5. Test/lint/type-check results.
6. Any remaining blockers or follow-up tasks.
