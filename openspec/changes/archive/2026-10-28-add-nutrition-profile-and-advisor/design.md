# Design

## Context

This builds on the existing provider boundary (`FoodRecognitionProvider`, `PassioClient`), the food-log and summary queries, and the day-window utility. See proposal.md for motivation.

### Live verification of `nutritionAdvisor` (2026-10-28)

The response is stored in `evidence/passio-nutritionAdvisor.live.json`.

- Request: `POST /v2/products/napi/tools/nutritionAdvisor`, JSON `{content: "What should I have for dinner tonight?", message: "Demo profile: ... Logged today: oatmeal 307 kcal, blueberries 42 kcal."}`.
- Response: `{answer: string}` containing markdown (headings, bullets, bold text). The answer used the profile and the log; it said "Since you have consumed approximately 350 kcal today…".
- Took 3.3 s and 654 tokens (`X-Model-Tag: gemini-3-1-flash-lite`).
- The docs describe the route as "chat-style" but stateless; no conversation id exists.

## Goals / Non-Goals

**Goals:**
- Ground all guidance in Passio. The app adds context and guardrails, never its own advice.
- Keep personal data minimal and non-medical.

**Non-Goals:**
- Clinical decision support, medication or GLP-1 guidance, diagnosis, or calorie prescriptions.
- Persisted chat history.
- Voice input to the advisor via Passio `audio_file`. The browser speech-to-text button is reused, so the user can still edit the question.

## Decisions

1. **New provider boundary `NutritionGuidanceProvider`** with `askAdvisor(content, context)`. Implementations: `PassioGuidanceProvider` (reuses the `PassioClient` token cache and error mapping through a shared client instance), `MockGuidanceProvider` (`[MOCK]` answer), and an unconfigured provider. It is a separate interface rather than more methods on `FoodRecognitionProvider`, so recognition tests stay focused; the factory builds both from one `PassioClient`.

2. **Context assembly (`buildAdvisorContext`).** A pure function, unit-tested, sent as Passio's `message` field (documented as "free-text context"). Plain labeled text, in this order:
   1. Safety instructions: "You are a general nutrition information assistant. Do not give medical advice, diagnose, discuss medications or supplements as treatment, or set clinical targets. Respect the diet preferences and never suggest foods listed under 'avoid'. If asked a medical question, recommend a qualified health professional."
   2. Profile: goal label, calorie target or "not set", diets, and foods to avoid.
   3. Today (in the browser timezone, passed as `tz`): each entry's name and calories, plus totals. A total with missing values is marked "(partial: N entries missing)".
   4. Up to 3 previous turns, each answer truncated to 600 characters.

   The total `message` is capped at 4,000 characters. History is dropped first when over the cap. The user's question goes in `content`.

3. **Scope guard (`isOutOfScope`).** This runs before any Passio call. It is a case-insensitive word-boundary regex list covering:
   - medication, medicine, drug, dose/dosage, prescription, side effect, supplement for/as treatment;
   - GLP-1, semaglutide, Ozempic, Wegovy, Rybelsus, tirzepatide, Mounjaro, Zepbound, liraglutide, Saxenda, insulin, metformin;
   - diagnose/diagnosis, symptom, disease, cure, treat/treatment;
   - pregnant/pregnancy, breastfeeding.

   It responds 422 `ADVISOR_OUT_OF_SCOPE`.
   - As built: "cure" matches `cure`/`cures` only, so "cured ham" is allowed. "treat" matches only as a verb (`treatment`, `treating`, `treated`, or "to/can/help… treat"), so "a healthy treat" is allowed. Both cases are unit-tested. This is deliberately conservative: false positives are acceptable for a demo. A keyword guard was chosen over an LLM classifier to avoid extra token cost and nondeterminism. It is unit-tested with allowed and blocked examples.

4. **Profile storage.** Prisma model `NutritionProfile` with columns `demo_user_id` (unique), `goal` (enum), `daily_calorie_target` (int, nullable), `diet_preferences` (text[]), `avoid_foods` (text[]), `created_at`, `updated_at`.
   - `PUT` upserts the row and validates with a zod `.strict()`-free object, so unknown keys are stripped; this satisfies "extra health fields ignored".
   - Goal labels are fixed in code, e.g. `more_protein` becomes "Eat more protein". Weight loss is excluded until a product and clinical decision is made.

5. **Rendering.** The web app uses `react-markdown` without `rehype-raw`, so raw HTML is never rendered. Links open with `rel="noopener noreferrer"` and `target="_blank"`. The disclaimer component appears under every answer.

6. **Conversation state.** It is kept in React state in the browser tab and lost on reload. The client sends the last 3 turns as `history`. The server does not store or log question or answer text; the request log already omits bodies.

7. **Timeouts and cost.** The advisor uses the default 45 s Passio timeout. The UI disables Send while a request is in flight.

## Risks / Trade-offs

- [The LLM may still give advice that sounds clinical] → Safety instructions, a keyword guard, and visible disclaimers. This remains a demo-level mitigation, and the README says a clinical and compliance review is required before real use.
- [The keyword guard blocks benign questions] → Accepted for a demo. The 422 message suggests rephrasing as a general food question.
- [The advisor may ignore foods to avoid] → The disclaimer says "check ingredients for allergies". The app never claims answers are allergen-safe.
- [Profile and log context are sent to a third party] → Demo data only, as already required. This is documented in the README privacy section.

## Migration Plan

One additive Prisma migration creates the `nutrition_profiles` table and its enum. Rollback means dropping the table; no other data depends on it.
