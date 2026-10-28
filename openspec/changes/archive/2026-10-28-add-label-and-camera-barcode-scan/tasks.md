# Tasks

## 1. Label scan backend

- [x] 1.1 Add `label` to the Prisma `InputType` enum with a migration, plus zod enums in recognition and food-log routes; verify `npm run db:migrate` applies and a food-log integration test saves and lists a `label` entry
- [x] 1.2 Change `normalizePassioFood` default quantity to `suggestedQuantity[0] ?? portion.quantity ?? 1` and capture `branded.ingredients` as `ingredientsText`; verify with a unit test on `evidence/passio-extractPackagedProduct.live.json` (copied to `apps/api/test/fixtures/`) that 2 × tbsp (16 g) totals 190 kcal, and that the existing Diet Coke fixture test still passes
- [x] 1.3 Add `recognizeLabel` to the provider interface, `PassioProvider` (`/products/napi/tools/vision/extractPackagedProduct`), `MockProvider`, and the unconfigured provider; verify with mocked-fetch tests for route, body, 400/404/malformed handling
- [x] 1.4 Accept `inputType=label` multipart uploads in `POST /api/food-recognition` with the existing type, size, and magic-byte checks; verify Supertest cases for success, unsupported media, and oversize

## 2. Label scan UI

- [x] 2.1 Add a "Label" tab with an upload field, a 1600 px client downscale, a processing state, and a "retake closer" no-match hint; verify in the browser against mock and real Passio with the synthetic label
- [x] 2.2 Show `ingredientsText` and the "check the package for allergens" note on the review screen; verify with a component test that no allergen claim is rendered

## 3. Camera barcode scanner

- [x] 3.1 Add `barcode-detector`, self-host its WASM via `prepareZXingModule` `locateFile`, and serve `.wasm` with `application/wasm` in nginx; verify the network panel shows no request to jsdelivr when the scanner opens
- [x] 3.2 Build the scanner component (environment camera, 250 ms decode loop, EAN/UPC formats, stop tracks on success, cancel, or unmount, permission and secure-context errors); verify with a component test using a stubbed detector and stream that tracks stop on success and on unmount
- [x] 3.3 Integrate the scanner into the Barcode tab with manual entry kept; verify in the browser on localhost that scanning a printed UPC triggers lookup, and that denying permission shows the fallback message

## 4. Docs and verification

- [x] 4.1 Update the README feature table and the manual checklist for label scan and camera scanning; verify the commands as written
- [x] 4.2 Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run smoke`, then rebuild Docker and confirm all pass

## Workflow follow-up

- Archive this change before `add-meal-plans`, which modifies the `Supported entry input types` requirement added here.
