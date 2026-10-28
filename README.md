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
| Barcode: camera scan or typed | ✅ Implemented. The camera scanner decodes EAN/UPC **in the browser**, using the native `BarcodeDetector` or the self-hosted `barcode-detector` / zxing-wasm fallback; Passio is not involved in scanning. Camera frames never leave the device. Needs https or localhost. | `GET /v2/products/napi/food/productCode/{code}` |
| Nutrition-facts label scan | ✅ Implemented (Nutrition label tab). The default serving comes from the label, e.g. 2 × tbsp (16 g). Ingredient text is shown when returned. Passio did **not** return the "Contains" allergen line in testing, so the app makes no allergen claims. ~17k tokens per scan. | `POST /v2/products/napi/tools/vision/extractPackagedProduct` |
| Voice | ✅ Implemented as **browser** speech-to-text (Web Speech API). The transcript is editable, then sent through the text route. Passio does **not** do speech recognition here. | same as text |
| Correct and retry | ✅ The user edits the description and it is re-recognized through the text route | same as text |
| Live camera *food* recognition | ❌ Not included. Passio has **no web SDK**; the docs say REST is the only option for web. On mobile, the photo and label inputs open the camera (`capture="environment"`). | n/a |
| Nutrition profile | ✅ Implemented (Profile tab). Fields: goal (from a fixed list), optional calorie target, diet preferences, and foods to avoid. No age, weight, conditions, or medications. A weight-loss goal is excluded pending product and clinical review. | n/a (stored in PostgreSQL) |
| AI nutrition advisor | ✅ Implemented (Advisor tab). Each question is sent with safety instructions, the profile, today's log and totals, and the last 3 turns as context. Medical questions are declined before Passio is called. Answers are rendered as markdown without raw HTML. The conversation is not saved. ~650 tokens per question. | `POST /v2/products/napi/tools/nutritionAdvisor` (`{content, message}` → `{answer}`) |
| Meal plans | ✅ Implemented (Meal plans tab). 1–7 day preview based on the profile and notes. Replace any meal, then approve to generate the full plan in the background (status is polled). The full plan shows recipes, ingredients, preparation, Passio's per-recipe and per-day macros, and a shopping list, which can be made shopping-friendly. "Log this meal" adds a diary entry using Passio's recipe macros, computed on the server. Plans are saved and can be deleted; logged meals stay in the diary. | `generateMealPlanPreview`, `generateMealPlan`, `humanizeShoppingList` |
| Meal-plan extras not included | ❌ `regenerateMeals` and `updateMealPlanShoppingList` (request and response formats are undocumented), affiliate grocery links, and `?model=` selection | n/a |

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

**Meal-plan cost and timing (measured live, 2 days):**

| Step | Tokens | Time |
|---|---|---|
| Preview | ~5,000 | 3–4 s |
| Regenerate | ~5,300 | ~3 s |
| Full plan | **~133,000** | 14–16 s (the docs say 1.5–6 min) |
| Shopping list | ~2,600 | ~3 s |

The full plan runs in an in-process background job. If the API restarts mid-generation, the plan is marked `failed` with `INTERRUPTED` and can be re-approved. Passio's plans can miss the calorie target (2,359 kcal against 2,000 in one test); the app shows Passio's numbers as returned.

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
10. Go to Log food → Nutrition label and upload a photo of a Nutrition Facts panel. The serving and calories should match the printed label, and the ingredients should appear with the allergen reminder.
11. Go to Log food → Barcode → Scan with camera on http://localhost:8080, and hold a product barcode to the camera. It should look the product up and turn the camera off. Deny camera permission once: the app should explain why and keep manual entry available.
12. Go to Profile, set a goal, a diet and a food to avoid, then save and reload. The values should persist.
13. Go to Advisor and ask "Give me a high-protein snack idea". The answer should respect the profile and show the not-medical-advice notice. Then ask "What should I eat to reduce Ozempic nausea?". It should be declined, with no call to Passio (check the API logs).
14. Go to Meal plans, create a 2-day preview, tick "Replace" on one meal and regenerate it: only that meal should change. Then approve: the status should go from generating to ready, with recipes and macros shown. Log a meal and confirm it appears on the dashboard. Click "Make shopping-friendly" and check the list updates.
15. Run `SMOKE_SECRET="$PASSIO_API_KEY" npm run smoke`, or search `apps/web/dist` for the key. It should not be found.

## Data, privacy and timezone

- **Table `food_log_entries`:**
  - Columns: `id` (UUID), `demo_user_id`, `logged_at` (timestamptz), `input_type`, `input_summary` (≤ 200 characters), `food_name`, `serving_unit`, `serving_weight_g`, `serving_quantity`.
  - Nutrients are stored twice: per serving (`*_per_serving`) and as totals (`calories`, `protein_g`, `carbohydrates_g`, `fat_g`, all nullable).
  - Also: `provider`, `passio_ref` (the refCode or barcode), `provider_payload` (a small normalized excerpt only), `created_at`, and `updated_at`.
  - Indexed on `(demo_user_id, logged_at DESC)`.
- **Advisor safety boundary:**
  - Questions about medications (including GLP-1 drugs such as Ozempic or Wegovy), dosing, side effects, diagnosis, symptoms, disease treatment, or pregnancy get a 422 `ADVISOR_OUT_OF_SCOPE` response and are never sent to Passio.
  - Every answer is labelled as general information, not medical advice.
  - This is a demo-level keyword guard; a clinical and compliance review is required before any real use.
- **Sent to Passio as advisor context:** the demo profile, today's food names and totals, and the last 3 turns of the conversation. Use demo data only.
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
