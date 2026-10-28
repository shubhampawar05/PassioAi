# Spec Delta

## Purpose

Persists user-confirmed food entries for a demo user in the application's own database and lets the user list, inspect, adjust, and delete them.

## ADDED Requirements

### Requirement: Save a confirmed food entry
The system SHALL persist a food entry only when the user explicitly confirms a reviewed recognition result. The request carries the food name, input type, short input summary, selected serving (unit label, optional gram weight), quantity, per-serving nutrient values (each nullable), and an optional provider reference. The server SHALL compute entry totals itself.

#### Scenario: Valid confirmed entry is saved
- **WHEN** the client submits a valid entry with quantity 2 and per-serving calories 100
- **THEN** the system responds 201 with the stored entry whose calories total is 200, an id, and created/updated timestamps

#### Scenario: Client-supplied totals are ignored
- **WHEN** the client submits an entry including an extra `calories` total field of 9999
- **THEN** the stored calories total equals per-serving calories multiplied by quantity, not 9999

#### Scenario: Invalid entry is rejected
- **WHEN** the client submits an entry with a missing food name, a non-positive quantity, a negative nutrient value, or an unknown input type
- **THEN** the system responds 400 with the standard error shape and nothing is stored

### Requirement: Missing nutrients stay missing
The system SHALL store a nutrient as null when the provider did not return it and SHALL NOT substitute zero or an estimate.

#### Scenario: Nutrient not returned
- **WHEN** an entry is saved with per-serving fat null
- **THEN** the stored fat total is null and the API returns null for fat

### Requirement: No raw media is stored
The system SHALL NOT persist uploaded image bytes or audio; only a short text input summary (at most 200 characters) is stored.

#### Scenario: Photo entry saved
- **WHEN** an entry originating from a photo is saved
- **THEN** the database row contains an input summary such as the file type and size, and no image data

### Requirement: List entries for a day
The system SHALL list the demo user's entries whose `logged_at` falls within the requested calendar day in the requested IANA timezone, newest first.

#### Scenario: Entries listed newest first
- **WHEN** the client requests entries for `date=2026-10-28&tz=America/New_York` and three entries exist that day
- **THEN** the system returns those three entries ordered by `logged_at` descending

#### Scenario: Invalid date or timezone
- **WHEN** the client requests `date=2026-13-40` or `tz=Not/AZone`
- **THEN** the system responds 400 with the standard error shape

### Requirement: Retrieve a single entry
The system SHALL return one entry by id, including its per-serving values and stored provider reference.

#### Scenario: Entry exists
- **WHEN** the client requests an existing entry id
- **THEN** the system responds 200 with the entry

#### Scenario: Entry does not exist
- **WHEN** the client requests a well-formed id that does not exist, or a malformed id
- **THEN** the system responds 404 or 400 respectively with the standard error shape

### Requirement: Edit entry quantity
The system SHALL allow updating an entry's quantity and SHALL recompute its totals from the stored per-serving values without calling Passio.

#### Scenario: Quantity changed
- **WHEN** the client updates an entry with per-serving protein 10 g to quantity 1.5
- **THEN** the stored protein total becomes 15 g and `updated_at` changes

### Requirement: Delete an entry
The system SHALL delete an entry by id so it no longer appears in lists or summaries.

#### Scenario: Entry deleted
- **WHEN** the client deletes an existing entry
- **THEN** the system responds 204 and subsequent list and summary requests for that day exclude it

### Requirement: Entries persist across restarts
Entries SHALL be stored in PostgreSQL on a named Docker volume so they survive container restarts.

#### Scenario: Restart
- **WHEN** an entry is saved and the containers are stopped and started again without removing volumes
- **THEN** the entry is still returned by the list endpoint
