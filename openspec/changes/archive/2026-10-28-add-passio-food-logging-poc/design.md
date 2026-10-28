# Design

## Context

The repository is empty apart from the requirements document, so this is a greenfield build (see proposal.md - Why). Tooling on the dev machine: Node 26, npm 11, Docker 29 / Compose v5, OpenSpec 1.15. No Passio API key is present in the environment at design time.

### Passio documentation findings (verified 2026-10-28)

All facts come from https://passio.gitbook.io/nutrition-ai (page index: `/llms.txt`).

| Topic | Finding | Source page |
|---|---|---|
| Web SDK | None. "For web apps the REST API is the only option." SDKs exist for iOS, Android, React Native, Flutter. | getting-started/api-vs-sdk |
| Auth | `POST https://api.passiolife.com/v2/token-cache/unified/oauth/token/{API_KEY}` → `{access_token, expires_in (~86155 s), token_type:"Bearer", customer_id, scope}`. Every call sends `Authorization: Bearer <access_token>` and `Passio-ID: <customer_id>`. | rest-api/api-overview/authorization-setup |
| Base URL | `https://api.passiolife.com/v2/products`, use `/napi/...` routes. | fundamentals/ai-docs-summary |
| Photo | `POST /napi/tools/vision/extractIngredientsAutoTyped`, JSON `{image: "data:<mime>;base64,...", message?}`; JPEG/PNG/WebP/GIF; recommends ~500 px. Returns an **array** of `FC_IngredientExtractOutput` (multiple foods supported) with `ingredientName`, `displayName`, `portionSize`, `portionQuantity`, `weightGrams`, `mealName`, `refCode`, `nutritionPreview {portion {quantity, weight {unit,value}, name, suggestedQuantity[]}, calories, carbs, fat, protein, fiber}`. Auto-detects dishes, packaged products, and barcodes. | rest-api/usage-guide/food-recognition-routes |
| Text | `POST /napi/tools/extractIngredients`, JSON `{content, message?}` → same array type. `POST /napi/tools/extractMealLogAction` `{content}` → `{action, mealTime, date, items[]}` (its example and schema disagree). **As built, the app uses extractMealLogAction; see Decision 14.** | rest-api/additional-features/text-tools, usage-guide/voice-logging |
| Barcode | `GET /napi/food/productCode/{productCode}` → `PassioFood {id, name, nutrients[], portions[], branded, iconId, refCode, ...}`; 404 = not found. | rest-api/usage-guide/barcode-lookup |
| Nutrients | `nutrients[]` entries `{nutrient {name, unit, shortName}, amount}` per **100 g**; only documented example is `{name:"Energy", unit:"KCAL", shortName:"calories"}`. Portion scaling `N = amount × (weight.value/100) × suggestedQuantity[0]`; no portions → assume 100 g. Protein/carb/fat `shortName` strings are **not documented**. | rest-api/data-essentials/models-and-usage |
| Nutrition label | `POST /napi/tools/vision/extractPackagedProduct` (image ~1200 px) → `NewPassioFood`; example and schema disagree. | rest-api/usage-guide/nutrition-labels-scan |
| Voice | Some routes accept multipart `audio_file` (MP3 example), but no transcript is returned and Passio-side speech recognition is not described. | usage-guide/voice-logging |
| Advisor / meal plans | `POST /napi/tools/nutritionAdvisor` (`{content}` → `{answer}`), `generateMealPlanPreview`, `generateMealPlan` (1.5–6 min), etc. | additional-features/advisor-endpoint, mealplans |
| Errors | 400, 401 (bad/expired token), 402 (budget exhausted), 403 (invalid key/permission), 429 (capacity; some pages say budget), 500, 503. Body `ErrorResponse {code, cause}`. `X-Request-ID` header on responses. | api-overview/errors-and-troubleshooting |
| Plans | Token-metered tiers; docs list no plan gate on vision, search, barcode, advisor, or meal plans. | token-system-and-pricing |

## Goals / Non-Goals

**Goals:**
- Simplest supported integration: backend-mediated REST calls, one adapter module, mockable behind an interface.
- Tolerant but validated parsing of provider responses, because several doc pages show example payloads that disagree with their schemas.
- Reproducible local setup: `docker compose up --build` runs db + migrations + api + web.

**Non-Goals:**
- Live/continuous camera recognition (no Web SDK; polling REST would spend tokens on each frame).
- Nutrition-facts-label endpoint, meal plans, nutrition advisor (documented, but outside core scope; see Decision 9).
- Authentication, multi-user support, production hardening.

## Decisions

1. **REST API via Express, not an SDK.** No Web SDK exists. The browser never talks to Passio; the API key and tokens stay in the API process. CORS for Passio is undocumented, so proxying is needed anyway.

2. **Structure: npm workspaces `apps/api` + `apps/web`, no shared package.** The API's contract types are small; the web app declares its own matching types. A shared package would add a build step for little value. Prisma schema lives in `apps/api/prisma`.

3. **Stack versions.** Express 5, Zod 4 (request + provider-response validation), Multer 2 (memory storage, 8 MB limit), Prisma 7 with `@prisma/adapter-pg`, Vite + React 19, Vitest, Supertest, ESLint + typescript-eslint. TypeScript 6.0 (typescript-eslint does not yet support TS 7). Node 24 LTS in containers.

4. **Provider boundary.** `FoodRecognitionProvider` exposes `recognizeImage(buffer, mime)`, `recognizeText(text)`, `lookupBarcode(code)`, each returning `RecognitionResult { source: "passio" | "mock", candidates: FoodCandidate[], requestId? }`. Implementations: `PassioProvider` (real) and `MockProvider` (opt-in via `PASSIO_MODE=mock`). With `PASSIO_MODE=passio` but no key, the factory returns a provider whose calls fail with `PROVIDER_NOT_CONFIGURED`; it never falls back to mock.

5. **Passio client details.**
   - The token is cached in memory until `expires_in − 60 s`; concurrent callers share one in-flight token request. On a 401 from a data endpoint, the token is invalidated, then the client re-authenticates once and retries once.
   - Timeouts use `AbortSignal.timeout`: 10 s for the token, 45 s for vision/LLM routes, 15 s for barcode. All are configurable.
   - Error mapping follows the food-recognition spec. HTTP 402 and 429 both map to `PROVIDER_QUOTA`, because the docs conflict.
   - The client does not retry with backoff, to avoid spending extra tokens. The UI offers a manual retry.

6. **Normalization.**
   - *Photo/text items* (`FC_IngredientExtractOutput`): name = `displayName` ‖ `ingredientName` ‖ `shortName`. One serving option comes from `nutritionPreview.portion`, labelled `"{quantity} {name}"` with grams when `weight.unit` is g. Per-serving nutrients are `nutritionPreview.calories/protein/carbs/fat`. **Assumption:** preview values describe that portion. The docs do not state the basis, so the UI labels values "approximate", and this must be validated against a live response. `refCode` is kept as the provider reference. Items without `nutritionPreview` keep null nutrients.
   - *Barcode* (`PassioFood`): nutrients are summed from top-level `nutrients[]`, or from `ingredients[].nutrients[]` when the top level is absent. They are matched by `shortName`/`name`: calories = shortName `calories` or name `Energy` with unit KCAL; protein = shortName `protein` or name matching /^protein/i; carbs = shortName `carbs`/`carbohydrates` or name matching /carbohydrate/i; fat = shortName `fat` or a name equal to "fat" / "total fat" / "total lipid (fat)". Saturated and trans fat never match. Each portion becomes a serving option with per-serving value `amount × weight.value/100` and default quantity `suggestedQuantity[0] ?? 1`. No portions gives a 100 g serving. An unmatched nutrient stays null.
   - Zod schemas use `.passthrough()`/optional fields so undocumented extras do not break parsing. A non-array vision body, or a barcode body without a name, is `PROVIDER_BAD_RESPONSE`.

7. **Entry storage and totals.**
   - The client posts the chosen serving + quantity + per-serving nutrients. The server validates them (finite, ≥ 0, quantity in (0, 100]) and stores both the per-serving values and the totals (`per_serving × quantity`, rounded to 1 decimal place).
   - Quantity edits recompute from the stored per-serving values. Client totals are never read.
   - Limitation: the per-serving values originate from the client's copy of the recognition result. Re-fetching from Passio on save would double token cost, so it is not done in this POC.

8. **Timezone strategy.**
   - `logged_at` is a `timestamptz`, stored in UTC and defaulting to now.
   - Day queries take `date=YYYY-MM-DD&tz=<IANA>` (the web app sends `Intl.DateTimeFormat().resolvedOptions().timeZone`).
   - The server computes `[startUtc, endUtc)` from local midnight to the next local midnight, using `Intl` offset resolution. This handles 23/25-hour DST days without extra dependencies.

9. **Optional features.** Advisor and meal-plan endpoints are documented. They are excluded here because they produce free-text nutrition guidance, which overlaps the requirement's clinical-advice boundary, and because `generateMealPlan` takes minutes. They are a candidate follow-up change. Nutrition-label scanning is excluded too: its doc example contradicts its schema, and `extractIngredientsAutoTyped` already auto-detects packaged products in the photo flow.

10. **Image handling.** The browser downscales the image to a maximum 1024 px edge as a JPEG before upload; Passio recommends ~500 px, and 1024 keeps labels legible. The server checks the MIME type against the allowlist (JPEG/PNG/WebP/GIF) and validates the magic bytes. It then forwards the image as a data URI and discards the buffer. The input summary stored is, for example, "photo (image/jpeg, 84 KB)".

11. **Docker topology.**
   - `db` (postgres:16-alpine, named volume `pgdata`, `pg_isready` healthcheck).
   - `api` (runs `prisma migrate deploy` then the server; healthcheck on `/api/health`; `depends_on: db: service_healthy`).
   - `web` (Vite build served by nginx, which proxies `/api` to `api:3001`; `depends_on: api: service_healthy`).
   - Containers use service names, never `localhost`.

12. **Testing.**
   - Unit tests: normalization, totals, day-boundary math, Passio client error mapping (with a mocked `fetch`).
   - API tests: Supertest against the Express app, with an injected fake provider and a real Postgres test database (`passio_poc_test` on the Compose db).
   - Web: component tests for the review form's missing-value display.
   - Smoke test: a Node script that runs against the running Compose stack in mock mode.

13. **Implementation notes (as built).**
   - The API runs its TypeScript through `tsx`, both in dev and in the container. This avoids a separate compile step for the Prisma 7 generated client; `tsc --noEmit` is the type gate.
   - Migrations run on every API container start (`prisma migrate deploy`, idempotent).
   - The test database `passio_poc_test` is created by `docker/db-init` on first volume init.
   - The review screen lets the user save several recognized items at once; each becomes its own entry.
   - Recognition responses carry an `inputSummary` computed by the server, which the client echoes back when saving.
   - Live check on 2026-10-28: the documented token route `POST /v2/token-cache/unified/oauth/token/{key}` exists. An invalid key returned HTTP 403, which the app maps to `PROVIDER_AUTH`.

14. **Live verification with a test key (2026-10-28, task 6.5).** Captured responses are in `apps/api/test/fixtures/*.live.json` and are covered by `test/liveFixtures.test.ts`.
   - *Text route changed* to `POST /napi/tools/extractMealLogAction`. `extractIngredients` worked for "one banana" but returned `500 {"cause":"Failed to run tool on message"}` twice for "two scrambled eggs and a slice of whole wheat toast"; the meal-log route handled it. The live shape is an **array** of `{action, mealTime, date, items[]}`, which is neither the doc example nor the doc schema. The parser accepts groups or bare items and drops `action: "remove"` groups.
   - *`nutritionPreview` basis resolved.* The values cover `portion.quantity × portion.weight`. Banana 1 × 118 g → 105 kcal; eggs 2 × 64 g → 198.4 kcal; bread 0.83 × 36 g → 75.6 kcal, all consistent with USDA per-100 g values. The serving label and `weightG` therefore use the total weight, e.g. "2 large (128 g)".
   - *Barcode:* `shortName`s confirmed as `calories`, `protein`, `carbs`, `fat`. Drink portions use `weight.unit: "ml"`; they are kept and scaled with the documented formula (value/100), and `weightG` is null for ml servings.
   - *Unknown barcode* returns 404, which the app shows as zero candidates.
   - *Photo:* `extractIngredientsAutoTyped` returned 2 items for a banana-and-apple plate illustration in about 3.9 s.
   - *Token usage* per request was 75 (barcode) to about 3,900 (meal log), via `X-Request-Usage`.

## Risks / Trade-offs

- [The nutritionPreview basis is undocumented] → Resolved by live verification (Decision 14). Values are still labelled approximate.
- [Protein/carb/fat shortNames are undocumented] → Confirmed live (Decision 14). Tolerant name matching remains as a fallback; an unmatched nutrient shows "Not available".
- [Doc/live shape drift, e.g. the meal-log array] → Loose schemas plus live fixtures in the test suite.
- [Recognition accuracy, e.g. "scrambled" → "Boiled Eggs"] → The user reviews every result and can correct and retry before saving.
- [Doc examples disagree with schemas] → Validate only the fields we use. Malformed responses surface as `PROVIDER_BAD_RESPONSE`.
- [No API key in this environment] → The live end-to-end check is blocked until a key is provided. All automated tests use mocks. The README gives the live verification steps.
- [Token cost per recognition] → No automatic retries, and duplicate submissions are disabled in the UI.

## Migration Plan

Greenfield. `docker compose up --build` applies migrations automatically. Rollback = `docker compose down` (add `-v` to drop data).

## Open Questions

None remaining. The `nutritionPreview` basis and nutrient shortNames were resolved by live verification (Decision 14).
