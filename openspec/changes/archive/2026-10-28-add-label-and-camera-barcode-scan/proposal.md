# Proposal

## Why

Users want to log packaged foods the way they appear in the store: by pointing the camera at the barcode, or by photographing the Nutrition Facts label. Today barcodes must be typed in, and there is no dedicated label scan. Passio's `extractPackagedProduct` route was verified live on 2026-10-28 and returns structured label nutrition, and modern browsers can decode barcodes from the camera locally.

## What Changes

- Add a **Nutrition label** input. The user photographs a packaged product's Nutrition Facts panel, the backend sends it to Passio `POST /napi/tools/vision/extractPackagedProduct`, and the result is normalized into the same reviewable candidate format as barcode lookups. Servings come from the label's portion, e.g. "2 × tbsp (16 g)".
- Add **camera barcode scanning** to the Barcode tab. The browser decodes the barcode from the live camera locally. The decoded digits go through the existing Passio barcode lookup, and manual entry remains as a fallback. Camera frames never leave the device. Scanning is done by the browser, not by Passio, since Passio has no web SDK.
- Add the `label` input type to stored food-log entries (database enum migration).
- Show the product's ingredient text from the label result when Passio returns it. Passio did **not** return the label's "Contains" allergen line in live testing, so the UI must not imply allergen detection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `food-recognition`: adds label-based packaged-product recognition and camera barcode scanning. Existing photo, text, barcode, and voice requirements are unchanged.
- `food-log`: entries may now have input type `label`.

## Impact

- API: new `inputType=label` on `POST /api/food-recognition` (multipart); Prisma enum migration adding `label`.
- Web: Barcode tab gains a camera scanner. A new "Label" tab is added.
- New web dependency: `barcode-detector` (MIT), a polyfill for the standard BarcodeDetector API backed by `zxing-wasm`. Its WASM file is self-hosted with the app, not loaded from a public CDN.
- Token cost: a label scan used about 17,000 tokens in live testing, versus about 1,900 for a photo.
