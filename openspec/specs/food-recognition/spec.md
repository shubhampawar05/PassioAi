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
