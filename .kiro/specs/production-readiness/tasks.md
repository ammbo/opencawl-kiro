# Implementation Plan: Production Readiness

## Overview

This plan makes OpenCawl production-ready across 8 requirements: removing the waitlist, fixing dual-auth middleware, implementing task dispatch (voice + SMS), adding post-call SMS notifications, aligning pricing/plan gates, fixing paid-plan entitlement, fixing onboarding API key display, and polishing the landing page. Tasks are ordered so that foundational changes (migration, middleware, credits engine) land first, followed by features that depend on them, then frontend alignment, and finally cleanup/deletion.

## Tasks

- [x] 1. Database migration and foundational backend changes
  - [x] 1.1 Create migration `migrations/0013_add_task_dispatch_fields.sql`
    - Add `goal TEXT` column to `calls` table
    - Add `source TEXT NOT NULL DEFAULT 'api'` column to `calls` table
    - _Requirements: 3.3_

  - [x] 1.2 Implement plan-aware `checkEntitlement()` in `functions/lib/credits.js`
    - Add new export `checkEntitlement(db, user)` that returns `{ allowed: true }` for paid users (starter/pro) and checks `credits_balance >= 12` for free users
    - Keep existing `check()` function unchanged for backward compatibility
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.3 Write unit tests for `checkEntitlement()`
    - Test free user with sufficient credits → allowed
    - Test free user with insufficient credits → not allowed
    - Test starter user → always allowed
    - Test pro user → always allowed
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.4 Create SMS sending helper `functions/lib/sms.js`
    - Export `sendSms(env, from, to, body)` that calls Twilio Messages API
    - Use `env.TWILIO_ACCOUNT_SID`, `env.TWILIO_AUTH_TOKEN`
    - Return `{ success: boolean }`, log and swallow errors
    - _Requirements: 4.1, 4.6_

  - [x] 1.5 Write unit tests for `sendSms()` helper
    - Test successful send returns `{ success: true }`
    - Test failed fetch returns `{ success: false }` without throwing
    - _Requirements: 4.1, 4.6_

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Fix middleware dual-auth and update call endpoint
  - [x] 3.1 Update `functions/_middleware.js` for dual authentication
    - Remove `/api/waitlist/join` from `PUBLIC_PATHS`
    - Modify the `/api/openclaw/*` branch: try Bearer token auth first, then fall back to session cookie auth (parse cookie → verify JWT → load user from DB)
    - Return 401 only if both auth methods fail
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Write unit tests for dual-auth middleware
    - Test `/api/openclaw/call` with valid Bearer token → authenticated
    - Test `/api/openclaw/call` with valid session cookie (no Bearer) → authenticated
    - Test `/api/openclaw/call` with neither → 401
    - Test `/api/openclaw/status` with session cookie → authenticated
    - Test `/api/openclaw/credits` with session cookie → authenticated
    - Test `/api/waitlist/join` is no longer in PUBLIC_PATHS
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Update `functions/api/openclaw/call.js` to use `checkEntitlement()`
    - Replace `import { check }` with `import { checkEntitlement }` from credits.js
    - Replace `check(db, user.id, MINIMUM_CALL_CREDITS)` with `checkEntitlement(db, user)`
    - Update the insufficient-credits error branch to use the new return shape
    - Include `goal` and `source` columns in the INSERT statement (default `source: 'api'`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 2.6_

  - [x] 3.4 Write unit tests for updated call endpoint
    - Test free user with insufficient credits → 402
    - Test paid user → call proceeds regardless of credits_balance
    - Test call record includes `source: 'api'` column
    - _Requirements: 6.1, 6.5, 2.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement task dispatch system (voice + SMS)
  - [x] 5.1 Update `functions/lib/inbound-routing.js` for owner dispatch
    - Modify `buildOwnerTwiml()` to pass `owner_mode: "dispatch"` as a dynamic variable
    - Add a dispatch-oriented system prompt that instructs the ElevenLabs agent to listen for task instructions and use the `dispatch_call` tool
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Write unit tests for owner dispatch TwiML
    - Test that owner TwiML includes `owner_mode` parameter with value `dispatch`
    - Test that owner TwiML includes the dispatch system prompt
    - _Requirements: 3.1, 3.2_

  - [x] 5.3 Implement `functions/api/webhooks/elevenlabs/tools.js` (dispatch_call tool)
    - Replace the 501 stub with full implementation
    - Verify ElevenLabs signature using `ELEVENLABS_WEBHOOK_SECRET_TOOLS`
    - Extract `user_id` from conversation dynamic variables
    - Parse `dispatch_call` tool parameters: `destination_phone`, `goal`
    - Validate destination phone (E.164)
    - Create call record in DB with `source: 'voice_dispatch'`, `goal` column populated
    - Initiate ElevenLabs outbound call using `buildElevenLabsPayload()` with goal as system prompt context
    - Return tool result JSON to ElevenLabs (success/failure message)
    - _Requirements: 3.2, 3.3, 3.4, 3.8_

  - [x] 5.4 Write unit tests for tools webhook dispatch_call
    - Test valid dispatch_call → creates call record, initiates outbound call, returns success
    - Test invalid signature → 401
    - Test missing destination_phone → returns error tool result
    - Test invalid E.164 phone → returns error tool result
    - _Requirements: 3.2, 3.3, 3.4, 3.8_

  - [x] 5.5 Implement `functions/api/webhooks/twilio/sms.js` (SMS inbound dispatch)
    - Verify Twilio signature
    - Look up owner of the `To` number
    - If sender matches owner phone, parse SMS body for E.164 phone number using `/\+\d{1,15}/`
    - If no phone number found, reply with TwiML asking for clarification
    - If phone number found, extract goal (remainder of message), create call record with `source: 'sms_dispatch'`, initiate outbound call
    - Reply with TwiML confirming dispatch or error
    - _Requirements: 3.5, 3.6, 3.7_

  - [x] 5.6 Write unit tests for SMS inbound webhook
    - Test valid SMS with phone number → dispatches call, returns confirmation TwiML
    - Test SMS without phone number → returns clarification TwiML
    - Test invalid Twilio signature → 403
    - Test non-owner sender → ignored or rejected
    - _Requirements: 3.5, 3.6, 3.7_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add post-call SMS notification
  - [x] 7.1 Update `functions/api/webhooks/elevenlabs/post-call.js` to send SMS
    - After billing logic, look up the user record
    - If user has a `phone` and a `twilio_phone_number`, generate a summary from the transcript
    - Summary format: `"OpenCawl: Called {destination}. {outcome}"` (≤160 chars)
    - Extract last agent message from transcript as outcome, truncate to fit
    - If transcript is empty/missing, send `"OpenCawl: Call to {destination} completed. No transcript available."`
    - Send via `sendSms()` helper using user's OpenCawl number as sender
    - If SMS fails, log and continue (non-blocking)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.2 Write unit tests for post-call SMS notification
    - Test completed call with transcript → SMS sent with summary ≤160 chars
    - Test completed call without transcript → SMS sent with "no transcript" message
    - Test SMS send failure → logged, webhook still returns 200
    - Test call with zero duration → no SMS sent
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Fix voice clone plan gate
  - [x] 8.1 Update `functions/api/voice/clone.js` plan gate
    - Change `user.plan !== 'pro'` to `user.plan === 'free'` so both starter and pro users can clone
    - Update error message to "Voice cloning requires a paid plan"
    - _Requirements: 5.5, 5.6_

  - [x] 8.2 Write unit tests for updated voice clone gate
    - Test free user → 403
    - Test starter user → allowed
    - Test pro user → allowed
    - _Requirements: 5.5, 5.6_

- [x] 9. Fix onboarding API key display
  - [x] 9.1 Update `src/dashboard/pages/Onboarding.jsx` Step 3 (Connect OpenClaw)
    - If existing keys found: show message "API key was previously generated and cannot be shown again" instead of displaying `key_prefix + '…'`
    - Add "Regenerate Key" button that calls `DELETE /api/keys/revoke` then `POST /api/keys/create`
    - When a new key is generated (fresh or regenerated): display full key with copy button
    - Add warning text: "Save this key now — it won't be shown again"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Align pricing across landing page and billing page
  - [x] 11.1 Update `src/dashboard/pages/Billing.jsx` plan features
    - Ensure the PLANS array matches the design: Free (250 one-time credits, shared number, 5 curated voices), Starter (100 min/mo, dedicated number, full voice library + cloning), Pro (350 min/mo, dedicated number, full voice library + cloning)
    - _Requirements: 5.4_

  - [x] 11.2 Update `src/landing/index.html` pricing section
    - Free: 250 credits (one-time), shared phone number, 5 curated voices, API access
    - Starter: 100 min/month, dedicated phone number, full voice library + cloning, $0.12/min overage
    - Pro: 350 min/month, dedicated phone number, full voice library + cloning, $0.12/min overage
    - All pricing card buttons: `href="/src/login/"` with text "Get Started"
    - _Requirements: 5.1, 5.2, 5.3, 5.7_

- [x] 12. Landing page production polish and waitlist removal
  - [x] 12.1 Remove waitlist section and update CTAs in `src/landing/index.html`
    - Delete the entire `#waitlist` section (form, heading, subtitle)
    - Hero CTA: `href="/src/login/"` with text "Get Started"
    - Nav "Get Started" button: `href="/src/login/"`
    - Remove `href="#waitlist"` references from nav links
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.13_

  - [x] 12.2 Update landing page content for production accuracy
    - Hero subtitle: accurate description of current capabilities (no unreleased features)
    - "You call your Claw" demo: describe inbound dispatch flow, mention SMS notification on completion
    - "Your Claw calls the world" demo: accurate outbound calling description
    - Features voice card: "5 curated voices" for free, mention cloning for paid plans
    - FAQ "When will it be available?": "OpenCawl is live and available for sign-up"
    - Footer copyright: current year
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 12.3 Remove waitlist logic from `src/landing/script.js`
    - Delete all waitlist form submission code (form listener, validation, fetch to `/api/waitlist/join`)
    - Keep smooth scroll behavior
    - _Requirements: 1.10_

- [x] 13. Delete waitlist files and site-gate
  - [x] 13.1 Delete waitlist and site-gate files
    - Delete `functions/api/waitlist/join.js`
    - Delete `functions/api/admin/waitlist.js`
    - Delete `functions/api/admin/waitlist/approve.js`
    - Delete `functions/api/admin/waitlist/reject.js`
    - Delete `functions/lib/site-gate.js`
    - Delete `functions/api/waitlist/waitlist.test.js` (tests for deleted code)
    - Remove any imports of `checkSiteGate` from remaining files
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.11, 1.12_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Migration (1.1) must land before any code that writes `goal`/`source` columns
- Middleware dual-auth (3.1) must land before dashboard call flow works end-to-end
- SMS helper (1.4) must exist before post-call notification (7.1) and SMS dispatch (5.5)
- File deletions (13.1) are last to avoid breaking any remaining references during development
- Checkpoints ensure incremental validation at natural breakpoints
