# Implementation Plan: OpenClaw Results Callback

## Overview

This plan implements the closed-loop results pipeline between the Openclaw agent and the OpenCawl platform. Tasks are ordered so each step builds on the previous: database schema first, then the API endpoint, status endpoint updates, SKILL/CLI updates, and finally the dashboard UI components. Property-based tests validate correctness properties from the design document.

## Tasks

- [ ] 1. Add `openclaw_result` column to calls table
  - [ ] 1.1 Create migration `migrations/0016_add_openclaw_result.sql`
    - Add `ALTER TABLE calls ADD COLUMN openclaw_result TEXT;` with a descriptive comment
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Implement POST /api/openclaw/results endpoint
  - [ ] 2.1 Create `functions/api/openclaw/results.js` with `onRequestPost`
    - Use `parseBody(request, ['call_id', 'result'])` from `functions/lib/validation.js` for input parsing
    - Reject `result` exceeding 10,000 characters with HTTP 400 and error code `INVALID_INPUT`
    - Update the call record: `UPDATE calls SET openclaw_result = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    - Return 404 with `NOT_FOUND` if no matching row (covers non-existent and wrong-user cases)
    - Return 200 with `{ success: true, call_id }` on success
    - Follow the same `json()` helper and error format patterns as `call.js` and `status.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 2.2 Write property test: Results round-trip (Property 1)
    - **Property 1: Results round-trip — stored result matches submitted result**
    - For any valid result string (1–10,000 chars), POST to results endpoint then GET status returns the exact same string in `openclaw_result`
    - Add to `functions/api/openclaw/openclaw.test.js` following existing test patterns
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 2.3 Write property test: Invalid payloads rejected (Property 2)
    - **Property 2: Invalid payloads are rejected**
    - For any payload with missing/empty `call_id` or `result`, endpoint returns HTTP 400 with `INVALID_INPUT`
    - **Validates: Requirements 2.2, 2.6**

  - [ ]* 2.4 Write property test: Result length enforcement (Property 3)
    - **Property 3: Result length enforcement**
    - Strings > 10,000 chars return 400; strings 1–10,000 chars are accepted
    - **Validates: Requirements 1.3, 2.8**

- [ ] 3. Checkpoint — Verify results endpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Update GET /api/openclaw/status to include summary, openclaw_result, goal
  - [ ] 4.1 Modify `functions/api/openclaw/status.js` response object
    - Add `summary: row.summary ?? null` to the returned JSON
    - Add `openclaw_result: row.openclaw_result ?? null` to the returned JSON
    - Add `goal: row.goal ?? null` to the returned JSON
    - The existing `SELECT *` already fetches these columns — changes are response-only
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 4.2 Write property test: Status returns all stored fields (Property 4)
    - **Property 4: Status endpoint returns all stored call fields**
    - For any call record with arbitrary `summary`, `openclaw_result`, and `goal` values (including NULL), the GET response includes those exact values
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 5. Update SKILL.md and CLI script
  - [ ] 5.1 Update `public/opencawl/SKILL.md` with results documentation
    - Add "Post results back" as step 3 in the Core Behavior action sequence (between acting on transcript and notifying user)
    - Add a new "Task: Post results back" section with CLI usage example
    - Update the default/help command reference to include `results`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 5.2 Add `results` command to `public/opencawl/scripts/opencawl.mjs`
    - Add a `results` case to the switch statement
    - Accept `--call-id` (required) and `--result` (required) arguments
    - Send `POST /api/openclaw/results` with `{ call_id, result }` body
    - Print confirmation with call_id on success
    - Print error and `process.exit(1)` on failure or missing args
    - Update the default help text to include the `results` command
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Checkpoint — Verify API and CLI changes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement CallDetail modal component
  - [ ] 7.1 Create `src/dashboard/components/CallDetail.jsx`
    - Modal overlay component that fetches call data from `GET /api/openclaw/status?call_id=<id>`
    - Display call metadata: direction, destination phone, status badge, duration, date
    - Display summary section with placeholder ("No summary available") when null
    - Display transcript formatted with speaker labels (Agent/Caller), or placeholder when null
    - Display openclaw_result section, or placeholder ("No result posted yet") when null
    - Close button (X) and backdrop click to dismiss
    - Loading spinner while fetching, error message on fetch failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 7.2 Write property test: Transcript formatting (Property 5)
    - **Property 5: Transcript formatting preserves all speaker labels and messages**
    - For any transcript array of `{role, message}` objects, the formatted output contains each message's text and a speaker label for every entry
    - **Validates: Requirements 5.3**

- [ ] 8. Wire CallDetail into CallLog and Home page
  - [ ] 8.1 Update `src/dashboard/components/CallLog.jsx` with click handling
    - Add `onCallClick(callId)` callback prop
    - Add `onClick` handler to each `<tr>` that calls `onCallClick(call.id)`
    - Add `cursor: pointer` styling to rows
    - _Requirements: 5.1_

  - [ ] 8.2 Update `src/dashboard/pages/Home.jsx` to manage CallDetail state
    - Add `selectedCallId` state
    - Pass `onCallClick` handler to `CallLog` that sets `selectedCallId`
    - Render `CallDetail` modal when `selectedCallId` is set
    - Pass close handler that clears `selectedCallId`
    - _Requirements: 5.1, 5.6_

- [ ] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 6 correctness properties defined in the design document
- The existing middleware already handles Bearer token auth for `/api/openclaw/*` routes — no auth changes needed
- The existing `SELECT *` in the status endpoint already fetches new columns after migration
