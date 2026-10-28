# Proposal

## Why

Logging food is more useful when the app can answer "what should I eat next?" in the context of the user's goal and what they have already eaten. Passio's `POST /napi/tools/nutritionAdvisor` was verified live on 2026-10-28. It returns a markdown answer and accepts free-form context, so a demo of personalized, general nutrition guidance can be grounded in Passio rather than invented by the app.

## What Changes

- Add a **demo nutrition profile** for the demo user, stored in PostgreSQL. It holds a goal chosen from a fixed list, an optional daily calorie target, diet preferences, and foods to avoid.
- The profile intentionally excludes age, sex, weight, height, medical conditions, medications, and pregnancy. A weight-loss goal is also excluded pending product and clinical review.
- Add an **AI nutrition advisor** screen. The user asks a question, and the backend sends it to Passio with context: safety instructions, the profile, today's logged foods and totals, and up to 3 previous turns of the current conversation. Passio's markdown answer is rendered safely.
- Add a **safety boundary**: questions about medications (including GLP-1 drugs), diagnoses, symptoms, treatment, or pregnancy are declined by the backend without calling Passio, with a message to consult a qualified professional.
- Every answer carries a visible "general information, not medical advice" notice. The app never shows advisor output as clinical guidance.
- Advisor conversations are **not persisted**. They live only in the browser tab.

## Capabilities

### New Capabilities

- `nutrition-profile`: viewing and updating the demo user's goal, calorie target, diet preferences, and foods to avoid, with validation and no health data.
- `nutrition-advisor`: answering a general nutrition question via Passio using profile and today's-log context, with a scope guard, disclaimers, and safe rendering.

### Modified Capabilities

None.

## Impact

- API: `GET/PUT /api/profile`, `POST /api/advisor`. New Prisma model `NutritionProfile` with a migration.
- Web: a "Profile" view and an "Advisor" view, and `react-markdown` (MIT; does not render raw HTML by default).
- Passio cost: about 650 tokens per advisor question in live testing.
- Privacy: profile data is demo data only, but it is sent to Passio as context on each question. This is documented in the README.
