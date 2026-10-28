# Spec Delta

## Purpose

Computes a daily nutrition summary (calories, protein, carbohydrates, fat, entry count) from the application's persisted food entries so the dashboard reflects what the user actually logged.

## ADDED Requirements

### Requirement: Totals come from persisted entries
The system SHALL compute daily totals on the server from the entries stored for the requested day; it SHALL NOT use hard-coded sample data or client-supplied totals.

#### Scenario: Summary of two entries
- **WHEN** a day has entries with calories 200 and 350
- **THEN** the summary for that day reports calories total 550 and entry count 2

#### Scenario: Empty day
- **WHEN** a day has no entries
- **THEN** the summary reports entry count 0 and every nutrient total as 0 with zero contributing entries

### Requirement: Missing values are reported, not hidden
For each nutrient the summary SHALL report the sum of available values, the number of entries that contributed a value, and the number of entries missing that value, so the client can flag partial totals.

#### Scenario: One entry lacks fat
- **WHEN** a day has two entries and only one has a fat value of 5 g
- **THEN** the fat total is 5, with 1 contributing entry and 1 missing entry

### Requirement: Day boundaries follow the requested timezone
The system SHALL interpret `date=YYYY-MM-DD` as the local calendar day in the IANA timezone given by `tz` (default `UTC`) and include entries with `logged_at` in [local midnight, next local midnight), including on DST transition days.

#### Scenario: Entry near midnight
- **WHEN** an entry is logged at 2026-10-29T03:30Z and the summary is requested for `date=2026-10-28&tz=America/New_York`
- **THEN** the entry is included (it is 23:30 local on 2026-10-28)

#### Scenario: DST transition day
- **WHEN** the summary is requested for `date=2026-11-01&tz=America/New_York`
- **THEN** the day window is 25 hours long and entries within it are included

### Requirement: Deleted and edited entries are reflected
The summary SHALL reflect current entry state after deletion or quantity edits.

#### Scenario: Delete updates totals
- **WHEN** an entry with 300 calories is deleted from a day totalling 550
- **THEN** the summary for that day reports 250
