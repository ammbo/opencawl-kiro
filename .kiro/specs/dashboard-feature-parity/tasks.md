# Implementation Plan: Dashboard Feature Parity

## Overview

Add four missing frontend pages (Make a Call, Inbound Config, Onboarding Flow, Install/Connect) to the Preact dashboard, plus one D1 migration, one new backend endpoint, and a minor update to an existing endpoint. All other backend APIs already exist. Implementation proceeds bottom-up: shared components first, then pages, then routing/wiring.

## Tasks

- [x] 1. Database migration and backend changes
  - [x] 1.1 Create the `0012_add_onboarding_completed.sql` migration
    - Add `ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;` to `migrations/0012_add_onboarding_completed.sql`
    - _Requirements: 18.1_

  - [x] 1.2 Create `POST /api/auth/onboarding-complete` endpoint
    - Create `functions/api/auth/onboarding-complete.js`
    - Export `onRequestPost` that sets `onboarding_completed = 1` for the authenticated user
    - Return `{ success: true }` on success
    - _Requirements: 18.2_

  - [x] 1.3 Update `GET /api/auth/me` to include `onboarding_completed`
    - In `functions/api/auth/me.js`, add `onboarding_completed: user.onboarding_completed === 1` to the profile response object
    - _Requirements: 18.3_

- [x] 2. Shared components and hooks
  - [x] 2.1 Create `VoiceSelector` component
    - Create `src/dashboard/components/VoiceSelector.jsx`
    - Fetch voices from `GET /api/voice/library` on mount, cache in state
    - Render a `<select>` with voice names; empty option for "Default"
    - Props: `value`, `onChange`, `id`
    - _Requirements: 3.3_

  - [x] 2.2 Create `useCallStatus` hook
    - Create `src/dashboard/hooks/useCallStatus.js`
    - Signature: `useCallStatus(callId)` → `{ status, transcript, duration, error, reset }`
    - Poll `GET /api/opencawl/status?call_id={callId}` every 2 seconds when `callId` is non-null
    - Stop polling on terminal states (`completed`, `failed`)
    - Clean up interval on unmount; `reset()` clears state and stops polling
    - _Requirements: 4.1, 4.5_

  - [x] 2.3 Add new icons to `Icons.jsx`
    - Add `PhoneOutIcon`, `PhoneIncomingIcon`, `DownloadIcon`, `CopyIcon`, `ChevronDownIcon`, `ChevronUpIcon` to `src/dashboard/components/Icons.jsx`
    - Follow existing Lucide-style 24×24 SVG pattern
    - _Requirements: 1.2, 6.2, 15.2_

- [x] 3. Checkpoint
  - Ensure all shared components render without errors, ask the user if questions arise.

- [x] 4. Implement Call page
  - [x] 4.1 Create `Call.jsx` page component
    - Create `src/dashboard/pages/Call.jsx`
    - Render `PhoneInput` for destination number, textarea for "Goal / Message", and "Call Now" button
    - "Call Now" disabled when phone is empty/invalid or goal is empty
    - On submit: POST to `/api/opencawl/call` with `destination_phone` and `message`
    - While POST in flight: button shows "Calling…" and stays disabled
    - On success: store returned `call_id` and activate `useCallStatus` polling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Add collapsible Advanced Options to Call page
    - Add a collapsible "Advanced Options" section with `ChevronDownIcon`/`ChevronUpIcon` toggle
    - When expanded: render `VoiceSelector`, "System Prompt" textarea, "First Message" input
    - Include populated override fields in POST body; omit empty ones
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 4.3 Add live call status display to Call page
    - Display call status badge: `pending` → "Queued", `in_progress` → "In Progress", `completed` → "Complete", `failed` → "Failed"
    - On `completed`: show transcript and duration formatted as `MM:SS`
    - On `failed`: show error message and "Try Again" button that resets the form
    - _Requirements: 4.2, 4.3, 4.4, 4.6_

  - [x] 4.4 Add error handling to Call page
    - `INSUFFICIENT_CREDITS`: Toast with error message + link to `/dashboard/billing`
    - `INVALID_INPUT`: Toast with validation error message
    - Other errors: Toast with error message, re-enable "Call Now" button
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.5 Write unit tests for Call page
    - Test form validation (disabled states)
    - Test error code handling (INSUFFICIENT_CREDITS, INVALID_INPUT, generic)
    - Test status badge label mapping
    - _Requirements: 2.3, 4.2, 5.1, 5.2, 5.3_

- [x] 5. Implement Inbound Config page
  - [x] 5.1 Create `InboundConfig.jsx` page component
    - Create `src/dashboard/pages/InboundConfig.jsx`
    - On mount: fetch agent config from `GET /api/phone/agent-config`, populate form
    - Render "System Prompt / Goal" textarea, "Greeting Message" input, `VoiceSelector` dropdown
    - "Save" button: POST to `/api/phone/agent-config` with `system_prompt`, `first_message`, `voice_id`
    - On success: Toast "Configuration saved"; on failure: Toast with error message
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Add Accepted Numbers management to Inbound Config
    - For paid users: fetch and display accepted numbers from `GET /api/phone/accepted-numbers`
    - Render `PhoneInput` + "Label" input for adding new numbers; POST to `/api/phone/accepted-numbers`
    - Render "Remove" button per number; DELETE to `/api/phone/accepted-numbers`
    - Show note: empty list means any caller can reach the agent
    - For free users: hide section, show "requires paid plan" message
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.3 Write unit tests for Inbound Config page
    - Test form population from API response
    - Test save success/error toasts
    - Test accepted numbers add/remove flows
    - Test free-plan gating of accepted numbers section
    - _Requirements: 7.1, 7.6, 7.7, 8.6_

- [x] 6. Checkpoint
  - Ensure Call and Inbound Config pages render and function correctly, ask the user if questions arise.

- [x] 7. Implement Onboarding flow
  - [x] 7.1 Create `Onboarding.jsx` page component with step navigation
    - Create `src/dashboard/pages/Onboarding.jsx`
    - Render progress bar with 4 steps: "Welcome", "Number", "Connect", "Call"
    - Store current step in `localStorage` keyed by `onboarding_step_${user.id}`
    - Restore saved step on load
    - _Requirements: 10.1, 14.1, 14.2_

  - [x] 7.2 Implement Step 1 — Welcome
    - Display user's verified phone number from `user.phone`
    - Render "Get Started" button that advances to step 2
    - _Requirements: 10.2, 10.3_

  - [x] 7.3 Implement Step 2 — Get a Phone Number
    - Render "Provision Number" button → POST `/api/phone/provision`
    - On success: display provisioned number + "Continue" button to step 3
    - On failure: Toast with error + "Skip" button to step 3
    - Render "Skip for now" link to advance to step 3
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 7.4 Implement Step 3 — Connect Agent
    - Auto-generate API key via POST `/api/keys/create` if none exists
    - Display API key with "Copy" button
    - Fetch and display `/opencawl.js` content in read-only code block with "Copy" button
    - Render "Continue" and "Skip" buttons to advance to step 4
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.5 Implement Step 4 — First Test Call
    - Render call form (phone input pre-filled with `user.phone`, goal textarea, "Call Now" button)
    - Use `useCallStatus` for live status, transcript, and duration display
    - Render "Finish Setup" button → POST `/api/auth/onboarding-complete`, redirect to `/dashboard/`
    - Render "Skip" link → same completion flow
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 7.6 Write unit tests for Onboarding flow
    - Test step navigation and progress bar rendering
    - Test localStorage persistence and restoration
    - Test completion POST and redirect
    - _Requirements: 10.1, 14.1, 14.2, 13.3_

- [x] 8. Implement Install page
  - [x] 8.1 Create `Install.jsx` page component
    - Create `src/dashboard/pages/Install.jsx`
    - On mount: fetch existing keys from `GET /api/keys/list`
    - Render "Generate Setup Key" button → POST `/api/keys/create`
    - Display generated key with "Copy" button and one-time-only warning
    - Fetch and display `/opencawl.js` content in read-only code block with "Copy" button
    - Toast on successful copy
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3_

  - [x] 8.2 Write unit tests for Install page
    - Test key generation and display
    - Test skill file fetch and copy
    - _Requirements: 16.2, 16.3, 17.2, 17.3_

- [x] 9. Checkpoint
  - Ensure Onboarding and Install pages render and function correctly, ask the user if questions arise.

- [x] 10. Route registration and navigation wiring
  - [x] 10.1 Update `app.jsx` with new routes and onboarding redirect
    - Import `Call`, `InboundConfig`, `Onboarding`, `Install` page components
    - Register routes: `/dashboard/call`, `/dashboard/inbound`, `/dashboard/onboarding`, `/dashboard/install`
    - Add onboarding redirect: if `user.onboarding_completed === false || user.onboarding_completed === null`, redirect to `/dashboard/onboarding` (skip if already on that route)
    - _Requirements: 1.1, 6.1, 9.1, 9.2, 9.3, 15.1_

  - [x] 10.2 Update `Layout.jsx` with new nav items
    - Import `PhoneOutIcon`, `PhoneIncomingIcon`, `DownloadIcon` from `Icons.jsx`
    - Add nav items: "Make a Call" → `/dashboard/call`, "Inbound" → `/dashboard/inbound`, "Install" → `/dashboard/install`
    - Active styles applied automatically by existing URL matching logic
    - _Requirements: 1.2, 1.3, 6.2, 6.3, 15.2, 15.3_

- [x] 11. Visual design consistency pass
  - [x] 11.1 Ensure all new pages use existing CSS design system
    - Verify all pages use CSS custom properties (`--bg`, `--bg-card`, `--accent`, `--border`, `--text`, `--text-muted`, `--radius`, `--radius-sm`)
    - Verify use of `.card`, `.btn-primary`, `.btn-secondary`, `.form-input`, Toast patterns
    - Verify responsive behavior at 768px and 480px breakpoints
    - Add any page-specific CSS to `theme.css` following existing patterns
    - _Requirements: 19.1, 19.2, 19.3_

- [x] 12. Final checkpoint
  - Ensure all tests pass and all pages are accessible from the sidebar, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design does not use pseudocode — JavaScript/JSX (Preact) is the implementation language throughout
- All backend APIs already exist except the migration (task 1.1), the onboarding-complete endpoint (task 1.2), and the me.js update (task 1.3)
- Onboarding page renders as a full-screen wizard without the Layout sidebar
