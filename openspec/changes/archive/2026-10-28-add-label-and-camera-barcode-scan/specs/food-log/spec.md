# Spec Delta

## ADDED Requirements

### Requirement: Supported entry input types
Each stored entry SHALL record how it was captured, as one of `photo`, `text`, `barcode`, `voice`, or `label`. An entry with any other input type SHALL be rejected.

#### Scenario: Label entry saved
- **WHEN** the client saves a confirmed label-scan result with `inputType=label`
- **THEN** the system responds 201 and the entry is listed with input type `label`

#### Scenario: Unknown input type
- **WHEN** the client saves an entry with `inputType=fax`
- **THEN** the system responds 400 with `VALIDATION_ERROR` and nothing is stored
