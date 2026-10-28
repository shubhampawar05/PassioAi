# food-recognition Specification

## Purpose

Turns a user's photo, text description, or barcode into normalized, unsaved food candidates with nutrition data by calling Passio Nutrition AI from the backend, with explicit error categories and no invented values.

## Requirements

### Requirement: Recognize food from a photo
The system SHALL accept one JPEG, PNG, WebP, or GIF image up to 8 MB via `POST /api/food-recognition` (multipart, `inputType=photo`), send it to Passio's image recognition, and return every recognized food item as a candidate.

#### Scenario: Photo with two foods
- **WHEN** a valid image is submitted and Passio returns two items
- **THEN** the system responds 200 with two candidates, each with a name and the nutrition values Passio returned

#### Scenario: Unsupported file type
- **WHEN** a PDF or a file over 8 MB is submitted
- **THEN** the system responds 400 (`UNSUPPORTED_MEDIA` or `FILE_TOO_LARGE`) without calling Passio

### Requirement: Recognize food from text
The system SHALL accept a text description of 1–500 characters (`inputType=text` or `voice`) and send it to Passio's natural-language ingredient extraction, returning each extracted item as a candidate.

#### Scenario: Natural language meal
- **WHEN** the text "two scrambled eggs and a slice of toast" is submitted
- **THEN** the system returns the candidates Passio extracted with their nutrition values

#### Scenario: Empty or oversized text
- **WHEN** empty text or text longer than 500 characters is submitted
- **THEN** the system responds 400 with `VALIDATION_ERROR`

### Requirement: Voice input is browser-transcribed text
Voice input SHALL be transcribed in the browser, shown to the user for review and editing, and submitted as text with `inputType=voice`. The system SHALL NOT claim Passio performed speech recognition and SHALL hide the voice option when the browser lacks speech recognition.

#### Scenario: Browser without speech recognition
- **WHEN** the browser has no speech recognition API
- **THEN** the voice option is shown as unavailable with an explanation

### Requirement: Look up food by barcode
The system SHALL accept a manually entered barcode of 6–14 digits (`inputType=barcode`), look it up with Passio's product-code lookup, and return the product as a candidate with its documented portions.

#### Scenario: Known barcode
- **WHEN** a barcode Passio knows is submitted
- **THEN** the system returns one candidate with the product name, available servings, and per-serving nutrients computed from Passio's per-100 g values

#### Scenario: Unknown barcode
- **WHEN** Passio responds 404 for the barcode
- **THEN** the system responds 200 with zero candidates and the client shows a no-match message

### Requirement: Normalized candidates without invented values
Each candidate SHALL contain a display name, a list of serving options (label, quantity, optional gram weight), and per-serving calories, protein, carbohydrates, and fat, each a number or null. A nutrient absent or invalid in the provider response SHALL be null, never zero.

#### Scenario: Provider omits fat
- **WHEN** Passio returns an item without a fat value
- **THEN** the candidate's fat is null and the UI shows "Not available"

### Requirement: Classified provider errors
The system SHALL map Passio failures to stable error codes: invalid credentials (401/403) → `PROVIDER_AUTH`; budget or capacity (402/429) → `PROVIDER_QUOTA`; timeout → `PROVIDER_TIMEOUT`; network failure or 5xx → `PROVIDER_UNAVAILABLE`; unparseable response → `PROVIDER_BAD_RESPONSE`; missing key → `PROVIDER_NOT_CONFIGURED`. It SHALL NOT return a fabricated success.

#### Scenario: Provider timeout
- **WHEN** Passio does not answer within the configured timeout
- **THEN** the system responds 504 with `PROVIDER_TIMEOUT`

#### Scenario: Malformed provider response
- **WHEN** Passio returns 200 with a body that does not match the documented shape
- **THEN** the system responds 502 with `PROVIDER_BAD_RESPONSE`

#### Scenario: Quota exhausted
- **WHEN** Passio responds 402 or 429
- **THEN** the system responds 429 with `PROVIDER_QUOTA`

### Requirement: Opt-in labeled mock provider
A mock provider SHALL be used only when `PASSIO_MODE=mock` is set explicitly; every mock candidate and response SHALL be marked `source: "mock"`, and the UI SHALL show a visible mock banner.

#### Scenario: Real provider configured
- **WHEN** `PASSIO_MODE=passio` and Passio fails
- **THEN** the error is returned and no mock data is substituted

### Requirement: Safe logging
The system SHALL NOT log image content, audio, the API key, or access tokens; logs MAY include input type, sizes, durations, status codes, and the Passio `X-Request-ID`.

#### Scenario: Recognition request logged
- **WHEN** a photo recognition request completes
- **THEN** the log line contains the input type, byte size, duration, and status, and no base64 data or credentials

### Requirement: Recognize a packaged product from its nutrition label
The system SHALL accept one JPEG, PNG, WebP, or GIF image up to 8 MB via `POST /api/food-recognition` (multipart, `inputType=label`), send it to Passio's packaged-product extraction, and return the product as one candidate whose servings come from the label's portions and whose nutrients are scaled from Passio's per-100 g values.

#### Scenario: Readable nutrition label
- **WHEN** a photo of a Nutrition Facts panel stating "Serving size 2 Tbsp (32g)" and "Calories 190" is submitted and Passio returns per-100 g calories 593.75 with portion `{name: "tbsp", quantity: 2, weight: 16 g}`
- **THEN** the system responds 200 with one candidate whose default serving is 2 × "tbsp (16 g)" and whose calories for that default serving total 190

#### Scenario: Label not readable
- **WHEN** Passio cannot extract a product from the image (empty result, HTTP 400, or HTTP 404)
- **THEN** the system responds with zero candidates or `PROVIDER_REJECTED_INPUT`, and the client suggests retaking the photo closer to the label

#### Scenario: Unsupported label upload
- **WHEN** a non-image file or an image over 8 MB is submitted with `inputType=label`
- **THEN** the system responds 400 (`UNSUPPORTED_MEDIA` or `FILE_TOO_LARGE`) without calling Passio

### Requirement: Label results show ingredients without claiming allergen detection
When Passio returns ingredient text for a packaged product, the system SHALL show it on the review screen. The system SHALL NOT present any allergen warning or "allergen-free" claim derived from label scanning.

#### Scenario: Ingredients returned
- **WHEN** Passio returns `branded.ingredients` "roasted peanuts; sugar; palm oil; salt"
- **THEN** the review screen shows that ingredient text with a note to check the package for allergens

### Requirement: Scan a barcode with the camera
Where the browser grants camera access, the Barcode tab SHALL offer a live camera scanner that decodes EAN-13, EAN-8, UPC-A, or UPC-E codes on the device and submits the decoded digits through the existing barcode lookup. Camera frames SHALL NOT be uploaded or stored.

#### Scenario: Successful scan
- **WHEN** the user starts the scanner and a UPC-A code 049000028911 is held in view
- **THEN** the scanner stops the camera, fills in the barcode 049000028911, and looks it up through `POST /api/food-recognition` with `inputType=barcode`

#### Scenario: Camera unavailable or denied
- **WHEN** the browser has no camera, the page is not in a secure context, or the user denies camera permission
- **THEN** the UI explains why scanning is unavailable and manual barcode entry remains usable

#### Scenario: Scanner closed
- **WHEN** the user cancels scanning or leaves the Barcode tab
- **THEN** the camera stream is stopped and the camera indicator turns off
