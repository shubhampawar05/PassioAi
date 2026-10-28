# Spec Delta

## ADDED Requirements

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
