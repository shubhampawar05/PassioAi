# nutrition-advisor Specification

## Purpose

Answers a user's general nutrition question through Passio's nutrition advisor, personalized with the demo profile and today's food log, within explicit non-clinical boundaries.

## Requirements

### Requirement: Ask the advisor
The system SHALL accept `POST /api/advisor` with a `question` of 1–500 characters and an optional `history` of up to 3 prior `{question, answer}` pairs. It SHALL call Passio's nutrition advisor and return `{answer, source}`, where `answer` is Passio's text.

#### Scenario: Question answered
- **WHEN** the user asks "What should I have for dinner tonight?"
- **THEN** the system responds 200 with Passio's answer and `source: "passio"`

#### Scenario: Invalid question
- **WHEN** the question is empty, longer than 500 characters, or history has more than 3 entries
- **THEN** the system responds 400 with `VALIDATION_ERROR` without calling Passio

### Requirement: Answers use profile and today's log as context
The system SHALL send Passio, as context alongside the question: the stored profile (goal, calorie target, diet preferences, foods to avoid), today's logged food names and the daily totals in the user's timezone, and the provided history.

#### Scenario: Context sent
- **WHEN** the profile is vegetarian, avoids peanuts, and today's log contains oatmeal (307 kcal)
- **THEN** the context sent to Passio includes "vegetarian", "peanuts", and "oatmeal", and today's calorie total of 307

#### Scenario: Missing nutrient totals
- **WHEN** some of today's entries lack a nutrient value
- **THEN** the context labels that total as partial instead of presenting it as complete

### Requirement: Out-of-scope medical questions are declined
The system SHALL decline, without calling Passio, questions about medications or drugs (including GLP-1 medicines), dosing, side effects, diagnosis, symptoms, disease treatment, or pregnancy. It SHALL respond 422 with `ADVISOR_OUT_OF_SCOPE` and a message recommending a qualified health professional.

#### Scenario: GLP-1 side-effect question
- **WHEN** the user asks "What should I eat to reduce Ozempic nausea?"
- **THEN** the system responds 422 with `ADVISOR_OUT_OF_SCOPE` and no Passio call is made

#### Scenario: General nutrition question allowed
- **WHEN** the user asks "Give me a high-protein vegetarian snack idea"
- **THEN** the question is sent to Passio

### Requirement: Safety instructions accompany every request
Every advisor request to Passio SHALL include instructions to give general, non-medical nutrition information only, to respect the diet preferences and foods to avoid, and to recommend a professional for medical questions.

#### Scenario: Instructions present
- **WHEN** any question is sent to Passio
- **THEN** the context begins with the safety instructions before the profile and log data

### Requirement: Answers are labeled and rendered safely
The UI SHALL render the advisor answer as markdown without executing or rendering raw HTML. It SHALL display, next to every answer, a notice that the content is general information from Passio AI, may be inaccurate, and is not medical advice.

#### Scenario: Answer containing HTML
- **WHEN** an answer contains `<img src=x onerror=alert(1)>`
- **THEN** it is shown as inert text and no script runs

#### Scenario: Notice shown
- **WHEN** any answer is displayed
- **THEN** the "general information, not medical advice" notice is visible with it

### Requirement: Conversations are not stored
The system SHALL NOT persist advisor questions or answers in the database or logs. Logs MAY record only status, duration, and the Passio request id.

#### Scenario: After asking
- **WHEN** a question has been answered
- **THEN** no database row contains the question or answer, and the API log line contains no question text

### Requirement: Advisor failures are not masked
Provider failures SHALL use the existing provider error codes, and no fallback answer SHALL be fabricated. In mock mode, answers SHALL be marked `source: "mock"` and visibly labeled.

#### Scenario: Passio quota exhausted
- **WHEN** Passio responds 402 or 429
- **THEN** the system responds 429 with `PROVIDER_QUOTA` and the UI offers a retry
