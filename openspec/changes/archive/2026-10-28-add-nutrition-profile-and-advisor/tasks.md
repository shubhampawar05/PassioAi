# Tasks

## 1. Profile

- [x] 1.1 Add the Prisma `NutritionProfile` model, goal enum, and migration; verify `npm run db:migrate` applies to the dev and test databases
- [x] 1.2 Implement `GET /api/profile` (defaults when missing) and `PUT /api/profile` (zod validation, unknown keys stripped, upsert); verify Supertest cases for defaults, valid update and re-read, each invalid field, and dropped health fields
- [x] 1.3 Build the Profile view (goal select, calorie target, diet checkboxes, avoid-foods chips, save state, validation messages, "demo data only" note); verify in the browser that save and reload persist

## 2. Advisor backend

- [x] 2.1 Implement `isOutOfScope` with the design's term list; verify unit tests for blocked examples (Ozempic nausea, metformin dose, diabetes treatment, pregnancy) and allowed examples (high-protein snack, fiber ideas, dinner ideas)
- [x] 2.2 Implement `buildAdvisorContext` (safety instructions first, profile, today's entries and totals with partial flags, history, 4,000-character cap with history dropped first); verify unit tests for ordering, partial totals, and truncation
- [x] 2.3 Add `NutritionGuidanceProvider` with Passio (`/products/napi/tools/nutritionAdvisor`, `{content, message}`), mock, and unconfigured implementations sharing one `PassioClient`; verify mocked-fetch tests against `evidence/passio-nutritionAdvisor.live.json` (copied to test fixtures) and the error mapping
- [x] 2.4 Implement `POST /api/advisor` (validation, scope guard before the provider call, context from the profile and today's log in `tz`, `{answer, source}`); verify Supertest cases for success, 400, 422 out of scope with no provider call, provider errors, and that no question text appears in logs or the database

## 3. Advisor UI

- [x] 3.1 Build the Advisor view (question box with optional browser voice input, conversation thread in state, last 3 turns sent as history, loading and duplicate-send prevention, retry on error, out-of-scope message); verify in the browser against real Passio
- [x] 3.2 Render answers with `react-markdown` (no raw HTML) and the disclaimer under every answer; verify a component test that an `<img onerror>` answer renders inert and the disclaimer is present

## 4. Docs and verification

- [x] 4.1 Update the README (features, safety boundary, privacy note on context sent to Passio, manual checklist); verify the instructions as written
- [x] 4.2 Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run smoke`, plus a live question in Docker; confirm all pass

## Workflow follow-up

- Archive this change before `add-meal-plans`, which reads the nutrition profile.
- Product and clinical review of goals (including any weight-related goal) and the scope guard before any real-user use.
