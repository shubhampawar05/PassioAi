# Tasks

## 1. Scaffolding and tooling

- [x] 1.1 Create npm workspace root (`package.json`, `.gitignore`, `.env.example`, `tsconfig.base.json`, ESLint flat config) and verify `npm install` succeeds
- [x] 1.2 Scaffold `apps/api` (Express 5 + TS) and `apps/web` (Vite + React + TS) and verify `npm run typecheck` and `npm run lint` pass on the empty apps

## 2. Database and health

- [x] 2.1 Add `docker-compose.yml` with `db` (postgres:16-alpine, named volume, healthcheck) and verify `docker compose up -d db` reports healthy
- [x] 2.2 Add Prisma schema for `FoodLogEntry` (UUID id, demo_user_id, logged_at timestamptz, input_type enum, input_summary, food_name, serving fields, per-serving and total nutrients nullable, passio_ref, provider_payload json, timestamps, indexes on (demo_user_id, logged_at)) plus initial migration; verify `npm run db:migrate` applies cleanly
- [x] 2.3 Implement config loading (zod-validated env), error shape middleware, 404 handler, and `GET /api/health` with DB check; verify with Supertest tests for ok, degraded, and unknown route

## 3. Food log and summary

- [x] 3.1 Implement day-window utility (`date` + IANA `tz` → UTC range) with unit tests covering midnight edges and both DST transitions
- [x] 3.2 Implement nutrition math (per-serving × quantity, rounding, nullable) and daily summary aggregation (total, contributing, missing counts) with unit tests
- [x] 3.3 Implement `POST/GET(list)/GET(:id)/PATCH(:id)/DELETE(:id) /api/food-logs` with zod validation and server-side total computation; verify Supertest integration tests against the Postgres test DB (create, list newest-first, retrieve, 404/400, quantity edit recompute, delete, ignored client totals)
- [x] 3.4 Implement `GET /api/nutrition-summary` and verify integration tests for totals, missing values, timezone inclusion, and deletion updating totals

## 4. Passio integration

- [x] 4.1 Define provider interface, normalized `FoodCandidate` types, and zod schemas for documented Passio responses; verify normalization unit tests (vision item with/without nutritionPreview, PassioFood with portions / no portions / ingredient-level nutrients / unmatched nutrients)
- [x] 4.2 Implement `PassioClient` (token exchange + cache, `Authorization` + `Passio-ID` headers, timeouts, 401 re-auth once, error mapping, safe logging) and verify unit tests with mocked fetch for 401/403/402/429/5xx/timeout/network/malformed
- [x] 4.3 Implement `MockProvider` (opt-in, `source:"mock"`) and provider factory honoring `PASSIO_MODE`; verify unit test that passio mode without key yields `PROVIDER_NOT_CONFIGURED` and never mock data
- [x] 4.4 Implement `POST /api/food-recognition` (multipart photo with type/size/magic-byte checks; JSON text/voice/barcode) and verify Supertest tests with a fake provider for each input type, unsupported media, oversize, validation errors, and provider error status mapping

## 5. Web app

- [x] 5.1 Build API client, app shell, routing between Dashboard / Log food / Diary, demo + "approximate values" disclaimers, and mock-mode banner driven by `/api/health`; verify typecheck and manual render
- [x] 5.2 Build Dashboard (today's date, summary tiles with partial-data flags, entry count, recent entries, empty state, prev/next day) and verify in the browser against the running API
- [x] 5.3 Build Log food: photo (file input with camera capture hint, client downscale), text, barcode (manual), voice (Web Speech API → editable text, unavailable state); loading state and duplicate-submit prevention; errors with retry; verify in the browser
- [x] 5.4 Build review/confirm step (candidate selection, serving + quantity, "Not available" for nulls, edit description and retry via text) and verify a component test for missing-value display
- [x] 5.5 Build Diary (day list newest first, detail view, quantity edit, delete with confirmation) and verify in the browser that totals update

## 6. Docker, docs, verification

- [x] 6.1 Add Dockerfiles for api (migrate then start) and web (nginx proxy) and compose healthchecks/ordering; verify `docker compose up --build` from clean state serves the app
- [x] 6.2 Add smoke test script (health → recognize via mock → save → summary → delete) and verify it passes against the Compose stack in mock mode
- [x] 6.3 Verify persistence across `docker compose restart` / `down` + `up` and that the built web assets contain no API key
- [x] 6.4 Write README (setup, env vars, migrations, seed, run, test, troubleshooting, supported/unsupported Passio features, timezone strategy, limitations, manual test checklist) and verify commands as written
- [x] 6.5 Run live Passio verification with a configured test key (text, photo, barcode); record results and adjust normalization if live shapes differ (done 2026-10-28; see design.md Decision 14 and test/fixtures)

## Workflow follow-up

- Archive the change after review (live Passio verification 6.5 is complete).
- Candidate follow-up change: nutrition-label scan via `extractPackagedProduct`, and an advisor/meal-plan demo, pending a product decision on clinical-advice boundaries.
