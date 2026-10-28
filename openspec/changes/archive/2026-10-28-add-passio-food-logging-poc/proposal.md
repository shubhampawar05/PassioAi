# Proposal

## Why

We need to verify, end to end, that Passio Nutrition AI can power food logging in a web app: a user submits a food input, Passio recognizes it and returns nutrition data, the user confirms, and our own backend persists the entry and computes a daily summary. This is a technical proof of concept using demo data only; the repository is currently empty.

## What Changes

- Add a greenfield web POC: React + TypeScript + Vite frontend (`apps/web`), Node.js + TypeScript + Express backend (`apps/api`), PostgreSQL via Docker Compose, Prisma schema and migrations.
- Add a backend-only Passio integration module that authenticates with the Passio REST API (API key exchanged server-side for a short-lived bearer token), calls only documented endpoints, validates provider responses, and normalizes them into an internal nutrition result type. The API key never reaches the browser.
- Add food recognition from: **photo upload**, **text / natural language**, and **barcode (manual entry)**. Optional **voice** input uses the browser's own speech-recognition API to produce editable text that is then sent through the text flow; Passio does not perform speech-to-text in this POC.
- Add a review-before-save step: recognized foods are shown with serving and nutrient values (or "Not available"); the user may pick a serving, adjust quantity, edit the description and retry, and must confirm before anything is saved.
- Add a food diary persisted in PostgreSQL: list by day (newest first), view details, edit quantity (recomputed from stored per-unit nutrition, no new Passio call), and delete.
- Add a daily nutrition summary computed server-side from persisted entries, with explicit handling of missing values and previous/next day navigation.
- Add an opt-in, visibly labeled development mock provider for UI work and tests; it is never used silently when the real provider fails.
- Add Docker Compose (PostgreSQL with named volume + health check, API and web services), `.env.example`, `.gitignore`, README, unit/integration tests with a mocked Passio adapter, and a smoke test.
- Document Passio capabilities not included (nutrition-facts-label recognition, live camera recognition, meal plans / AI advisor) with the reason, per the official docs findings recorded in design.md.

## Capabilities

### New Capabilities

- `food-recognition`: Accepting a photo, text, or barcode input, calling Passio through the backend, and returning normalized, unsaved food candidates with nutrition data and clear error categories.
- `food-log`: Persisting user-confirmed food entries for a demo user and listing, retrieving, editing quantity, and deleting them.
- `nutrition-summary`: Computing daily calorie, protein, carbohydrate, and fat totals from persisted entries for a given calendar day, including missing-value handling and timezone rules.
- `platform-health`: Reporting application and database health for the local Docker-based demo environment.

### Modified Capabilities

None (no existing specs).

## Impact

- New code: `apps/api`, `apps/web`, `apps/api/prisma`, `docker-compose.yml`, `.env.example`, `README.md`.
- New external dependency: Passio Nutrition AI REST API (requires a Passio API key with the relevant products enabled; usage consumes the account's token budget).
- New runtime dependency: PostgreSQL 16 in Docker.
- Privacy: no raw images stored; only short input summaries and normalized nutrition data are persisted. Demo data only.
