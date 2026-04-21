# Implementation Plan: Per-Call Agent Configuration

## Overview

Evolve the OpenCawl phone platform to support per-call agent configuration for outbound calls, smart inbound call routing based on caller identity and number type, accepted numbers list management, user agent config storage, and retain polling-based call status tracking. Implementation follows the existing Cloudflare Pages Functions + D1 architecture in JavaScript.

## Tasks

- [x] 1. Database migrations for agent config, call overrides, and accepted numbers
  - [x] 1.1 Create migration `0009_add_agent_config_to_users.sql` adding `system_prompt TEXT` and `first_message TEXT` columns to the `users` table
    - _Requirements: 6.1_
  - [x] 1.2 Create migration `0010_add_override_columns_to_calls.sql` adding `override_system_prompt TEXT`, `override_voice_id TEXT`, and `override_first_message TEXT` columns to the `calls` table
    - _Requirements: 7.2_
  - [x] 1.3 Create migration `0011_create_accepted_numbers.sql` creating the `accepted_numbers` table with columns `id TEXT PRIMARY KEY`, `user_id TEXT NOT NULL REFERENCES users(id)`, `phone_number TEXT NOT NULL`, `label TEXT`, `created_at TEXT NOT NULL`, a `UNIQUE(user_id, phone_number)` constraint, and indexes on `user_id` and `(user_id, phone_number)`
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Extract pure logic helpers for outbound payload building and inbound caller classification
  - [x] 2.1 Create `functions/lib/agent-overrides.js` with a `buildElevenLabsPayload(agentId, fromNumber, destinationPhone, user, overrides, message)` function that constructs the ElevenLabs outbound call payload, mapping `system_prompt` → `conversation_config_override.agent.prompt.prompt`, `voice_id` → `conversation_config_override.tts.voice_id`, `first_message` → `conversation_config_override.agent.first_message`, and omitting fields not provided. Include a `validateOverrideFields({ system_prompt, first_message })` function that returns an error if `system_prompt` > 10,000 chars or `first_message` > 2,000 chars.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 2.2 Write property test for outbound override payload construction
    - **Property 1: Outbound override payload construction**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Use fast-check to generate arbitrary combinations of optional override fields and verify correct nested path mapping and omission of absent fields
  - [x] 2.3 Write property test for override field length validation
    - **Property 2: Override field length validation**
    - **Validates: Requirements 1.5, 1.6, 6.3, 6.4**
    - Use fast-check to generate strings above and below length limits and verify accept/reject behavior
  - [x] 2.4 Create `functions/lib/inbound-routing.js` with a `classifyCaller(callerNumber, owner, isSharedNumber)` function returning `'owner'`, `'unknown_shared'`, or `'unknown_dedicated'`. Add a `buildInboundTwiml(classification, { owner, agentId, callId, callerNumber, acceptedNumbers, callHistory })` function that returns the appropriate TwiML string for each classification path.
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_
  - [x] 2.5 Write property test for inbound caller classification
    - **Property 3: Inbound caller classification**
    - **Validates: Requirements 2.1**
    - Use fast-check to generate caller/owner phone pairs and verify owner vs unknown classification
  - [x] 2.6 Write property test for owner call using stored agent config
    - **Property 4: Owner call uses stored agent config**
    - **Validates: Requirements 2.2**
  - [x] 2.7 Write property test for unknown caller on shared number gets promo and hangup
    - **Property 6: Unknown caller on shared number gets promo and hangup**
    - **Validates: Requirements 3.1, 3.3**
    - Verify TwiML contains `<Say>` with promo and `<Hangup/>`, no `<Connect>` or `<Stream>`
  - [x] 2.8 Write property test for accepted numbers gate on dedicated numbers
    - **Property 7: Accepted numbers gate on dedicated numbers**
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Modify outbound call endpoint to support per-call overrides
  - [x] 3.1 Update `functions/api/opencawl/call.js` to import `buildElevenLabsPayload` and `validateOverrideFields` from `functions/lib/agent-overrides.js`. Accept optional `system_prompt`, `voice_id`, and `first_message` fields from the request body. Make `message` optional when `system_prompt` and `first_message` are both provided. Validate override field lengths. Use `buildElevenLabsPayload` to construct the ElevenLabs API payload. Store override fields on the call record in D1 (`override_system_prompt`, `override_voice_id`, `override_first_message`).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [x] 3.2 Write unit tests for outbound call endpoint changes
    - Test default behavior when no overrides provided (Req 1.4)
    - Test `destination_phone` still required (Req 1.7)
    - Test `message` optional when system_prompt + first_message present (Req 1.8)
    - Test 400 on oversized system_prompt and first_message (Req 1.5, 1.6)

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Rewrite inbound Twilio voice webhook for smart routing
  - [x] 5.1 Update `functions/api/webhooks/twilio/voice.js` to import `classifyCaller` and `buildInboundTwiml` from `functions/lib/inbound-routing.js`. After parsing the form body and validating the Twilio signature, determine number type by querying `shared_phone_numbers` for the called number. Look up the owner via `users WHERE twilio_phone_number = calledNumber`. Classify the caller using `classifyCaller`. Route based on classification:
    - **Owner Call**: Create call record with direction `'inbound'`, build TwiML Stream with owner's stored agent config (system_prompt, voice_id, first_message from users table) as override parameters
    - **Unknown on Shared**: Return promo TwiML `<Say>` mentioning OpenCawl + `<Hangup/>`
    - **Unknown on Dedicated**: Query `accepted_numbers` for the caller. If list is empty (open access) or caller is in list → accept, create call record, query call history from `calls` table for previous calls from that caller to the same user, pass call count as dynamic variable, build TwiML Stream. If list is non-empty and caller not in it → rejection TwiML + hangup.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 5.2 Write property test for inbound call record creation
    - **Property 5: Inbound call record creation**
    - **Validates: Requirements 2.4, 4.5**
  - [x] 5.3 Write property test for call history context for accepted callers
    - **Property 12: Call history context for accepted callers**
    - **Validates: Requirements 4.4**
  - [x] 5.4 Write unit tests for inbound routing
    - Test owner call fallback when no agent config stored (Req 2.3)
    - Test promo message content references OpenCawl (Req 3.2)
    - Test shared number identification via shared_phone_numbers table (Req 3.4)
    - Test open-access mode when accepted list is empty (Req 4.3)

- [x] 6. Implement user agent configuration endpoints
  - [x] 6.1 Create `functions/api/phone/agent-config.js` with `onRequestPost` and `onRequestGet` handlers. POST accepts `system_prompt`, `voice_id`, `first_message` and performs partial update on the `users` table (only overwrite provided fields). Validate `system_prompt` ≤ 10,000 chars and `first_message` ≤ 2,000 chars using `validateOverrideFields`. GET returns the user's stored `system_prompt`, `voice_id`, and `first_message`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 6.2 Write property test for agent config round-trip with partial updates
    - **Property 10: Agent config round-trip with partial updates**
    - **Validates: Requirements 6.1, 6.2, 6.5**
  - [x] 6.3 Write unit tests for agent config endpoints
    - Test validation errors for oversized fields (Req 6.3, 6.4)
    - Test partial update preserves omitted fields (Req 6.5)

- [x] 7. Implement accepted numbers list management endpoints
  - [x] 7.1 Create `functions/api/phone/accepted-numbers.js` with `onRequestGet`, `onRequestPost`, and `onRequestDelete` handlers. GET returns all numbers for the user with labels and timestamps. POST adds one or more E.164 numbers with optional labels (validate each with `isValidE164`). DELETE removes specified numbers. All three handlers check `user.plan !== 'free'` and return 403 FORBIDDEN for free-tier users.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 7.2 Write property test for accepted numbers CRUD round-trip
    - **Property 8: Accepted numbers CRUD round-trip**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [x] 7.3 Write property test for E.164 validation on accepted numbers
    - **Property 9: E.164 validation on accepted numbers**
    - **Validates: Requirements 5.4**
  - [x] 7.4 Write unit tests for accepted numbers endpoints
    - Test free user gets 403 (Req 5.5)
    - Test duplicate number handling via UNIQUE constraint

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update call status endpoint to return override fields
  - [x] 9.1 Update `functions/api/opencawl/status.js` to include `agent_override` in the response containing `system_prompt`, `voice_id`, and `first_message` from the call record's `override_system_prompt`, `override_voice_id`, `override_first_message` columns. Return `agent_override: null` when no overrides were used.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 9.2 Write property test for call status returns stored overrides
    - **Property 11: Call status returns stored overrides**
    - **Validates: Requirements 7.2**
  - [x] 9.3 Write unit tests for status endpoint
    - Test existing fields still returned (Req 7.1)
    - Test in-progress call returns null duration/transcript (Req 7.3)
    - Test call ownership check (Req 7.4)

- [x] 10. Verify tools webhook stub is unchanged
  - [x] 10.1 Confirm `functions/api/webhooks/elevenlabs/tools.js` still returns 501 Not Implemented and retains its documentation comments. No code changes needed — just verify the file is untouched.
    - _Requirements: 8.1, 8.2_

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- Pure logic is extracted into `functions/lib/agent-overrides.js` and `functions/lib/inbound-routing.js` to enable property-based testing
