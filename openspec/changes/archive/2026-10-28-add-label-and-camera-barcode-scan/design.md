# Design

## Context

Builds on the archived `2026-10-28-add-passio-food-logging-poc` change; see proposal.md for motivation.

- Barcode lookups already run through `PassioProvider.lookupBarcode` → `normalizePassioFood`.
- Photos already go through multipart upload with MIME and magic-byte checks.

### Live verification of `extractPackagedProduct` (2026-10-28)

The image tested was a synthetic Nutrition Facts label, kept as `evidence/synthetic-nutrition-label.svg`. The response is in `evidence/passio-extractPackagedProduct.live.json`.

- Request: `POST /v2/products/napi/tools/vision/extractPackagedProduct`, JSON `{image: "data:image/jpeg;base64,..."}`, the same body shape as the photo route.
- Response: the **schema shape** (`NewPassioFood`: `name`, `nutrients[]`, `portions[]`, `branded`, `tags`, `concerns`, `images`, `fromViews`), **not** the doc example's `ingredients[].metadata`.
- Nutrients are per 100 g: calories 593.75, fat 50, carbs 21.875, protein 25. For the 32 g serving that gives 190 kcal, 16 g fat, 7 g carbs and 8 g protein, exactly matching the label.
- Portion: `{name: "tbsp", quantity: 2, weight: {unit: "g", value: 16}}`. Here `weight` is per unit, and `quantity` is the label's serving count.
- `branded.ingredients` was "roasted peanuts; sugar; palm oil; salt". The "CONTAINS: PEANUTS" line was **not** returned, and there is no allergen field.
- The product name dropped the "DEMO" prefix. No `refCode` was returned.
- Took 4.4 s and 17,146 tokens (`X-Model-Tag: gpt-5.4-mini`).

## Goals / Non-Goals

**Goals:**
- Reuse the existing provider boundary, upload validation, normalization, and review UI.
- Scan barcodes on-device with graceful fallback to manual entry.

**Non-Goals:**
- Allergen detection, or warnings based on scanned labels.
- Multi-view (front + back) product capture. `fromViews` suggests Passio supports it, but this change sends one image.
- Live camera *food* recognition (still REST-only; no Passio web SDK).

## Decisions

1. **Label scan as `recognizeLabel(image, mime)` on `FoodRecognitionProvider`.** `PassioProvider` posts to `extractPackagedProduct` and parses with the existing `passioFoodSchema`, which already fits `NewPassioFood`. Results go through `normalizePassioFood`. `MockProvider` returns a `[MOCK]` product. This was preferred over reusing the photo route: the dedicated route returns per-100 g nutrients and label portions, while the photo route returns only previews.

2. **Portion default quantity.** In `normalizePassioFood`, `defaultQuantity` becomes `suggestedQuantity[0] ?? portion.quantity ?? 1`, so the label's "2 tbsp" is the default serving, with nutrients computed per single unit (16 g). This also fixes barcode portions that carry a `quantity`. The live Diet Coke fixture has `quantity: 1` everywhere, so it is unaffected; its test is kept and a label-fixture test is added.

3. **Image size.** Passio recommends ~1200 px for labels (vs ~500 px for food photos). The browser downscales label photos to a 1600 px max edge, at JPEG quality 0.9, to keep small print legible. The server-side 8 MB limit and type checks are unchanged.

4. **Persisted input type.** Add `label` to the Prisma `InputType` enum via a migration (`ALTER TYPE ... ADD VALUE`). Add it to the zod enums on recognition and food-log routes, and to the web `INPUT_LABELS` map.

5. **Camera barcode scanning library: `barcode-detector` (MIT, v3).** It is a polyfill for the standard `BarcodeDetector` API: it uses the native implementation where available (Chrome/Edge/Android) and `zxing-wasm` elsewhere (Safari, Firefox).
   - Alternatives: `@zxing/browser` is in maintenance mode; `html5-qrcode` was last published in 2023.
   - As built: native is used whenever it supports `ean_13`, with formats limited to the supported subset. Chromium on macOS lists `ean_13`, `ean_8` and `upc_e` but not `upc_a`; UPC-A codes still decode, as 13-digit EAN with a leading 0, which Passio accepts. Both paths were verified in the browser with a synthetic UPC-A stream for 049000028911, which returned Diet Coke.
   - The library fetches its `.wasm` from jsDelivr by default. Instead, the WASM file is copied into the Vite build and configured with `prepareZXingModule({ overrides: { locateFile } })`, so no third-party request is made. The nginx container serves `.wasm` with `application/wasm`.

6. **Scanner UX.**
   - The camera opens via `getUserMedia({ video: { facingMode: "environment" } })` into a muted `<video>`.
   - Frames are decoded every ~250 ms with formats `ean_13`, `ean_8`, `upc_a`, `upc_e`.
   - On the first valid 6–14 digit result, the stream tracks are stopped and the number is auto-submitted.
   - The stream also stops on cancel, tab change, or unmount.
   - Requires a secure context: localhost works; LAN IPs over HTTP do not, and the UI says so.

7. **Ingredient text.** Add an optional `ingredientsText` to `FoodCandidate.providerDetails` (from `branded.ingredients`). The review screen shows "Ingredients (from Passio): …" with "Always check the package for allergens." It is stored only inside the minimized `provider_payload`.

## Risks / Trade-offs

- [Real labels are photographed at angles, under glare, or curved] → Ask the user to fill the frame with the panel. Zero candidates show a "retake closer" hint. Live testing used a clean synthetic label, so real-photo accuracy is unverified.
- [Label scans cost ~9× a photo] → No automatic retries. The UI shows that it is processing and prevents duplicate submits.
- [Native BarcodeDetector support varies] → The polyfill provides a fallback. Manual entry always remains.
- [The WASM file adds ~1 MB] → It is loaded lazily, only when the scanner opens.

## Migration Plan

- One additive Prisma migration adds `label` to the enum. It is applied automatically on API start; existing rows are untouched.
- Rollback: revert the code. The extra enum value is harmless if unused.
