# Spec Delta

## Purpose

Lets developers and the container runtime verify that the demo API is running and can reach its database, and reports which Passio provider mode is active without exposing secrets.

## ADDED Requirements

### Requirement: Health endpoint reports app and database status
The system SHALL expose `GET /api/health` returning overall status, database status, and the configured recognition provider mode (`passio`, `mock`, or `unconfigured`), never the API key.

#### Scenario: Database reachable
- **WHEN** the API is running and PostgreSQL responds to a trivial query
- **THEN** the endpoint responds 200 with `status: "ok"` and `database: "ok"`

#### Scenario: Database unreachable
- **WHEN** the database query fails or times out
- **THEN** the endpoint responds 503 with `status: "degraded"` and `database: "error"`

### Requirement: Consistent error shape
Every API error response SHALL use the JSON shape `{ "error": { "code": string, "message": string } }` with an optional `details` field, and SHALL NOT include stack traces or secrets.

#### Scenario: Unknown route
- **WHEN** the client requests an undefined `/api/*` route
- **THEN** the system responds 404 with `error.code` equal to `NOT_FOUND`

### Requirement: Secrets stay server-side
The Passio API key SHALL be read only by the backend from environment variables and SHALL NOT appear in frontend bundles, API responses, or logs.

#### Scenario: Built frontend inspected
- **WHEN** the production frontend bundle is built with a key configured in the backend environment
- **THEN** searching the built assets for the key value finds no match
