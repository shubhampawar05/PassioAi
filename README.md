# Passio Nutrition AI: Food Logging Web POC

This is a technical proof of concept. A user logs food by **photo, text, barcode, or voice**. Passio Nutrition AI recognizes it, the user reviews and confirms the result, and the app saves the entry to its own PostgreSQL database. A daily nutrition summary is built from the saved entries.

> **Demo only.** Use synthetic or test data only. Nutrition values and portions come from Passio and are approximate estimates. This is not a medical device and gives no medical or dietary advice. Using real member data would first require a separate privacy, security, compliance, consent, and vendor review.

Requirements: [`PASSIO_NUTRITION_AI_POC_REQUIREMENTS.md`](PASSIO_NUTRITION_AI_POC_REQUIREMENTS.md). Spec-driven plan: [`openspec/changes/archive/2026-10-28-add-passio-food-logging-poc/`](openspec/changes/archive/2026-10-28-add-passio-food-logging-poc/). It covers the proposal, specs, design (with Passio documentation findings and citations), and tasks.

## Architecture

```
browser (React/Vite, apps/web) ──/api──▶ nginx (web container) ──▶ Express API (apps/api) ──▶ PostgreSQL 16
                                                                         │
                                                                         └──▶ Passio REST API (server-side only)
```

- **apps/web**: React 19 + TypeScript + Vite. It calls only `/api/*` on its own origin and never talks to Passio.
- **apps/api**: Express 5 + TypeScript, Zod validation, and Prisma 7 (`@prisma/adapter-pg`). It runs with `tsx`.
  - `src/recognition/` is the Passio boundary: `passioClient.ts` handles auth, headers, timeouts, and error mapping; `passioSchemas.ts` and `normalize.ts` validate and normalize responses; `mockProvider.ts` is the opt-in mock.
  - `src/foodLogs/` holds the diary and summary routes. `src/lib/` has the day-window and nutrition math.
- **apps/api/prisma**: schema and migrations.
- **docker-compose.yml** runs three services: `db` (named volume `pgdata`, healthcheck), `api` (runs migrations, then starts; healthcheck), and `web` (nginx serving the build and proxying `/api` to `api:3001`). Start-up order is gated on healthchecks.

## Passio features: what works and what is not included

Every fact here was checked against https://passio.gitbook.io/nutrition-ai on 2026-10-28. The table with page citations is in [`design.md`](openspec/changes/archive/2026-10-28-add-passio-food-logging-poc/design.md).

| Input / feature | Status in this POC | Passio route used |
|---|---|---|
| Photo upload (one or several foods) | ✅ Implemented | `POST /v2/products/napi/tools/vision/extractIngredientsAutoTyped` (base64 data URI) |
| Text / natural language | ✅ Implemented | `POST /v2/products/napi/tools/extractMealLogAction` (`{content}`). `extractIngredients` returned HTTP 500 for multi-food sentences in live testing. |
| Barcode (manual entry) | ✅ Implemented | `GET /v2/products/napi/food/productCode/{code}` |
| Voice | ✅ Implemented as **browser** speech-to-text (Web Speech API). The transcript is editable, then sent through the text route. Passio does **not** do speech recognition here. | same as text |
| Correct and retry | ✅ The user edits the description and it is re-recognized through the text route | same as text |
| Live camera recognition / live barcode scanning | ❌ Not included. Passio has **no web SDK**; the docs say REST is the only option for web. On mobile, the photo input opens the camera (`capture="environment"`). | n/a |
| Nutrition-facts label scan | ❌ Not included. `extractPackagedProduct` is documented, but its example and schema disagree. The photo route already detects packaged products automatically. | n/a |
| Meal plans / AI nutrition advisor | ❌ Not included. The endpoints are documented, but they produce free-text nutrition guidance, which falls outside the POC's no-clinical-advice boundary. Candidate follow-up. | n/a |

**Auth** follows the docs: `POST /v2/token-cache/unified/oauth/token/{PASSIO_API_KEY}` returns `access_token`, `expires_in`, and `customer_id`. Each call then sends `Authorization: Bearer …` and `Passio-ID: …`. The token is cached in memory until 60 s before it expires, and refreshed once on a 401.

**Error mapping:**

| Passio response | App error | HTTP |
|---|---|---|
| 401 or 403 | `PROVIDER_AUTH` | 502 |
| 402 or 429 (budget or capacity) | `PROVIDER_QUOTA` | 429 |
| Timeout | `PROVIDER_TIMEOUT` | 504 |
| Network error or 5xx | `PROVIDER_UNAVAILABLE` | 502 |
| Response that does not match the schema | `PROVIDER_BAD_RESPONSE` | 502 |
| 400 | `PROVIDER_REJECTED_INPUT` | 422 |
| No key configured | `PROVIDER_NOT_CONFIGURED` | 503 |

The app never substitutes mock data when Passio fails.

**Normalization (checked against live responses on 2026-10-28).** The real responses are saved in `apps/api/test/fixtures/`.

- **Photo and text items:** nutrients come from `nutritionPreview`. The values cover `portion.quantity × portion.weight`. For example, eggs at 2 × 64 g = 128 g gave 198 kcal, which matches USDA. The serving label shows the total, e.g. "2 large (128 g)".
- **Text route shape:** `extractMealLogAction` returns an array of `{action, mealTime, date, items[]}`. Items in an `action: "remove"` group are ignored.
- **Barcode products:** nutrients are per 100 g (per 100 ml for drinks), with `shortName`s `calories`, `protein`, `carbs`, `fat`. Portions can be in **ml**, e.g. "can (355 ml)", and are scaled with Passio's formula `amount × weight/100`.
- **Missing vs zero:** a nutrient Passio does not return shows **"Not available"**. A real zero, such as Diet Coke's 0 kcal, stays 0.

**Account requirements.** You need a Passio API key from https://accounts.passiolife.com (Product Details → Account Info). Usage is token-metered, and a request is billed for every recognition. The docs show no plan gate on the vision, text, or barcode routes.

## Setup

Prerequisites: Docker Desktop (Compose v2). Node ≥ 22.12 is only needed to run tests or dev servers outside Docker.

```bash
cp .env.example .env
```

Edit `.env` and set `PASSIO_API_KEY=` to your test key. To try the UI without a key, set `PASSIO_MODE=mock` instead.

### Run everything with Docker

```bash
docker compose up --build -d
```

Then open http://localhost:8080. The API health endpoint is http://localhost:8080/api/health.

Migrations run automatically when the `api` container starts (`prisma migrate deploy`). To run them by hand:

```bash
docker compose exec api npx prisma migrate deploy
```

To seed two clearly labeled `[DEMO]` entries for today (optional):

```bash
docker compose exec api npx tsx src/db/seed.ts
```

To try the labeled mock without editing `.env`:

```bash
PASSIO_MODE=mock docker compose up -d
```

### Environment variables

Defaults are in `.env.example`. Never commit `.env`.

| Variable | Purpose |
|---|---|
| `PASSIO_MODE` | `passio` (real API) or `mock` (opt-in labeled mock data) |
| `PASSIO_API_KEY` | Passio API key. Server-side only; never sent to the browser or logged. |
| `PASSIO_BASE_URL` | Default `https://api.passiolife.com/v2` |
| `PASSIO_TIMEOUT_MS` | Timeout for recognition calls; default 45000 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Database container settings |
| `DATABASE_URL` | Used by the API when it runs on the host. Compose overrides it to point at `db:5432`. |
| `TEST_DATABASE_URL` | Database for API integration tests (`passio_poc_test`, created automatically on first init) |
| `API_PORT`, `WEB_PORT`, `DEMO_USER_ID` | Ports and the demo user id |

### Local development (hot reload)

Install dependencies and start only the database:

```bash
npm install
```

```bash
docker compose up -d db
```

Apply migrations to the dev database:

```bash
npm run db:migrate
```

Start the API (reads `../../.env`) on :3001:

```bash
npm run dev:api
```

In another terminal, start Vite on :5173. It proxies `/api` to :3001.

```bash
npm run dev:web
```

## Tests and checks

API integration tests need the Compose `db` service running (`docker compose up -d db`). They use the `passio_poc_test` database. If your volume was created before `docker/db-init` existed, create that database once:

```bash
docker compose exec db createdb -U passio passio_poc_test
```

Then apply migrations to the test database:

```bash
DATABASE_URL=postgresql://passio:passio_dev_password@localhost:5432/passio_poc_test npm run db:migrate
```

Run the checks:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

Run the smoke test against a running stack. In `passio` mode it makes one real text call, which consumes tokens.

```bash
npm run smoke
```

To also check that your API key does not appear in the frontend bundle:

```bash
SMOKE_SECRET="$PASSIO_API_KEY" npm run smoke
```

What the automated tests cover:
- Response normalization, including missing fields.
- Totals and summary math.
- Timezone and DST day windows.
- Input validation: file type, magic bytes, 8 MB size limit, text, and barcode.
- Food-log create, list, get, edit, and delete against real Postgres.
- Passio client auth, headers, and token cache, plus error handling for 401, 402, 403, 429, 5xx, timeouts, network errors, and malformed responses.
- API routes using a fake provider, so no paid calls.
- Review-screen components.

### Manual test checklist

1. Run `docker compose up --build -d`. All three services should report healthy in `docker compose ps`.
2. Open http://localhost:8080/api/health. It should show `status: ok`, `database: ok`, and `recognitionProvider: passio`.
3. Go to Log food → Photo, Describe it, or Barcode, and submit a test input.
4. Check that the recognized foods, serving, and nutrients appear. Missing values should show "Not available".
5. Adjust the serving or quantity, then **Confirm and save**.
6. Run `docker compose restart` (or `down` then `up`, without `-v`), reload the page, and check that the entry is still there.
7. Check that the dashboard totals equal the sum of the entries. Partial totals should be flagged.
8. In the Diary, open Details, then delete the entry. Totals should update.
9. Try an empty text, a non-image file, a 5-digit barcode, and a wrong key. Each should show a clear error with a retry option.
10. Run `SMOKE_SECRET="$PASSIO_API_KEY" npm run smoke`, or search `apps/web/dist` for the key. It should not be found.

## Data, privacy and timezone

- **Table `food_log_entries`:**
  - Columns: `id` (UUID), `demo_user_id`, `logged_at` (timestamptz), `input_type`, `input_summary` (≤ 200 characters), `food_name`, `serving_unit`, `serving_weight_g`, `serving_quantity`.
  - Nutrients are stored twice: per serving (`*_per_serving`) and as totals (`calories`, `protein_g`, `carbohydrates_g`, `fat_g`, all nullable).
  - Also: `provider`, `passio_ref` (the refCode or barcode), `provider_payload` (a small normalized excerpt only), `created_at`, and `updated_at`.
  - Indexed on `(demo_user_id, logged_at DESC)`.
- **Raw images and audio are never stored.** Images are resized in the browser, forwarded to Passio, and then discarded. Logs record route, status, timing, and Passio `X-Request-ID` only. They never contain image data, text content, keys, or tokens.
- **Totals are computed on the server** as per-serving value × quantity. Any totals the client sends are ignored. Editing a quantity recalculates from the stored per-serving values; it does not call Passio again.
- **Timezone:**
  - `logged_at` is stored in UTC.
  - Day queries take `date=YYYY-MM-DD&tz=<IANA zone>`. The browser sends its own zone, and the default is UTC.
  - The server counts entries from local midnight up to, but not including, the next local midnight. DST days are therefore 23 or 25 hours long.
- Authentication is out of scope. All entries belong to a single `DEMO_USER_ID`.

## Troubleshooting

- **Port already in use** (5432, 8080): set `POSTGRES_PORT` or `WEB_PORT` in `.env`.
- **`PROVIDER_NOT_CONFIGURED`**: `PASSIO_API_KEY` is empty. Set it, then run `docker compose up -d api`.
- **`PROVIDER_AUTH`**: Passio rejected the key (the token route returned 401 or 403). Check the key in the Passio account portal.
- **`PROVIDER_QUOTA`**: the token budget is exhausted (402) or capacity is limited (429). Refill the budget in the portal, or retry later.
- **API tests fail with "database does not exist"**: create `passio_poc_test` and apply migrations, as described under Tests and checks.
- **Need a clean database**: `docker compose down -v` deletes all data.

## Known limitations / follow-ups

- **Live Passio verification was done on 2026-10-28 with a test key:**
  - Text: "two scrambled eggs and a slice of whole wheat toast" gave 2 items.
  - Photo: a plate illustration gave a banana and an apple, in about 4 s.
  - Barcode: `049000028911` returned Diet Coke; an unknown code returned 404, which the app treats as no match.
  - Invalid key: returned 403, which the app maps to `PROVIDER_AUTH`.
  - `npm run smoke` passes in `passio` mode.
  - The photo test used a drawn illustration rather than a real meal photo. Try a few real photos to judge accuracy.
- **Recognition accuracy depends on Passio.** For example, "scrambled eggs" was matched to "Boiled Eggs". Users can correct this with Retry on the review screen.
- Per-serving values saved with an entry come from the client's copy of the recognition result. Re-fetching them from Passio would double the token cost.
- The API runs TypeScript through `tsx` instead of a compiled build. This is acceptable for a POC.
- Possible follow-up changes: nutrition-label scanning, and meal-plan or advisor demos once a product and clinical review is done.
