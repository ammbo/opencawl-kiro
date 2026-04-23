# Requirements Document

## Introduction

This feature closes the loop between OpenCawl and the Openclaw agent system. Today, the Openclaw agent polls for completed call transcripts and acts on them, but has no way to report results back. This feature adds a results callback endpoint so the agent can POST outcomes back to OpenCawl, stores those results alongside the call record, updates the skill documentation and CLI to support the new endpoint, and adds a call detail view in the dashboard so users can click any call and see the summary, full transcript, and Openclaw result in one place.

## Glossary

- **OpenCawl_Platform**: The OpenCawl web application, including the Cloudflare Pages Functions API, D1 database, and Preact dashboard SPA.
- **Openclaw_Agent**: The external AI agent (the user's "Claw") that consumes the OpenCawl API via Bearer token authentication to make calls, poll transcripts, and now post results back.
- **Results_Endpoint**: The new `POST /api/openclaw/results` API route that accepts result payloads from the Openclaw_Agent.
- **Call_Record**: A row in the `calls` D1 table representing a single phone call, including its transcript, summary, and (new) openclaw_result.
- **Call_Detail_View**: A new UI component in the dashboard that displays the full details of a single call — summary, transcript, and Openclaw result.
- **CLI_Script**: The `opencawl.mjs` Node.js script distributed with the skill, used by the Openclaw_Agent to interact with the OpenCawl API.
- **SKILL_Document**: The `SKILL.md` file that instructs the Openclaw_Agent on how to use OpenCawl capabilities.

## Requirements

### Requirement 1: Store Openclaw Results on Call Records

**User Story:** As a user, I want Openclaw results stored alongside my call records, so that I can see what action the agent took for each call.

#### Acceptance Criteria

1. THE OpenCawl_Platform SHALL store an `openclaw_result` text field on each Call_Record.
2. WHEN a Call_Record is created, THE OpenCawl_Platform SHALL set the `openclaw_result` field to NULL.
3. THE OpenCawl_Platform SHALL support `openclaw_result` values up to 10,000 characters in length.

### Requirement 2: Results Callback Endpoint

**User Story:** As an Openclaw agent developer, I want a POST endpoint where the agent can submit results back to OpenCawl, so that call outcomes are recorded without polling.

#### Acceptance Criteria

1. THE Results_Endpoint SHALL accept POST requests at the path `/api/openclaw/results`.
2. WHEN a valid request is received, THE Results_Endpoint SHALL require a JSON body containing `call_id` (string, required) and `result` (string, required).
3. WHEN a valid request is received with a matching Call_Record owned by the authenticated user, THE Results_Endpoint SHALL update the `openclaw_result` field on that Call_Record and set `updated_at` to the current timestamp.
4. WHEN a valid request is received with a matching Call_Record, THE Results_Endpoint SHALL return HTTP 200 with a JSON body containing `{ "success": true, "call_id": "<id>" }`.
5. WHEN a request is received with a `call_id` that does not exist or does not belong to the authenticated user, THE Results_Endpoint SHALL return HTTP 404 with error code `NOT_FOUND`.
6. WHEN a request is received with missing or empty `call_id` or `result` fields, THE Results_Endpoint SHALL return HTTP 400 with error code `INVALID_INPUT`.
7. THE Results_Endpoint SHALL authenticate requests using the same Bearer token mechanism as other `/api/openclaw/*` routes.
8. WHEN a request contains a `result` field exceeding 10,000 characters, THE Results_Endpoint SHALL return HTTP 400 with error code `INVALID_INPUT` and a message indicating the result is too long.

### Requirement 3: Update SKILL Document for Results Callback

**User Story:** As an Openclaw agent, I want the skill documentation to instruct me to post results back after acting on a call, so that the user can see outcomes in their dashboard.

#### Acceptance Criteria

1. THE SKILL_Document SHALL include a section documenting the `POST /api/openclaw/results` endpoint, including the required JSON body fields (`call_id`, `result`).
2. THE SKILL_Document SHALL instruct the Openclaw_Agent to post results back to the Results_Endpoint after completing an action on a transcript, in addition to notifying the user through default channels.
3. THE SKILL_Document SHALL include a usage example showing the CLI command for posting results.
4. THE SKILL_Document SHALL update the Core Behavior section to add posting results as step 3 in the action sequence (between acting on the transcript and notifying the user).

### Requirement 4: Update CLI Script for Results Posting

**User Story:** As an Openclaw agent, I want a CLI command to post results back to OpenCawl, so that I can report outcomes using the same script I use for other operations.

#### Acceptance Criteria

1. THE CLI_Script SHALL support a `results` command with `--call-id` (required) and `--result` (required) arguments.
2. WHEN the `results` command is invoked with valid arguments, THE CLI_Script SHALL send a POST request to `/api/openclaw/results` with the `call_id` and `result` fields in the JSON body.
3. WHEN the Results_Endpoint returns a success response, THE CLI_Script SHALL print a confirmation message including the call_id.
4. WHEN the Results_Endpoint returns an error response, THE CLI_Script SHALL print the error message and exit with a non-zero exit code.
5. WHEN the `results` command is invoked without `--call-id` or `--result`, THE CLI_Script SHALL print a usage error and exit with a non-zero exit code.

### Requirement 5: Call Detail View in Dashboard

**User Story:** As a user, I want to click on a call in my call log and see the full summary, transcript, and Openclaw result, so that I can review what happened on any call.

#### Acceptance Criteria

1. WHEN a user clicks a row in the CallLog table, THE OpenCawl_Platform SHALL display a Call_Detail_View for that call.
2. THE Call_Detail_View SHALL display the call summary, or a placeholder if no summary is available.
3. THE Call_Detail_View SHALL display the full transcript formatted as a readable conversation (with speaker labels), or a placeholder if no transcript is available.
4. THE Call_Detail_View SHALL display the Openclaw result, or a placeholder if no result has been posted.
5. THE Call_Detail_View SHALL display call metadata: direction, destination phone number, status, duration, and date.
6. THE Call_Detail_View SHALL provide a way to close or navigate back to the call list.
7. WHEN the Call_Detail_View is displayed, THE OpenCawl_Platform SHALL fetch the full call details from the existing `GET /api/openclaw/status` endpoint (or an equivalent endpoint that returns summary, transcript, and openclaw_result).

### Requirement 6: Expose Result and Summary in Status Endpoint

**User Story:** As a dashboard developer, I want the call status endpoint to return the summary and Openclaw result alongside the transcript, so that the Call Detail View has all the data it needs.

#### Acceptance Criteria

1. THE OpenCawl_Platform SHALL include the `summary` field in the response from `GET /api/openclaw/status`.
2. THE OpenCawl_Platform SHALL include the `openclaw_result` field in the response from `GET /api/openclaw/status`.
3. THE OpenCawl_Platform SHALL include the `goal` field in the response from `GET /api/openclaw/status`.
