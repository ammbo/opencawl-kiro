# Requirements Document

## Introduction

The OpenCawl hackathon dashboard is missing four key UI features: a Make a Call page, an Inbound Config page, an Onboarding flow, and an Install/Connect Agent page. All backend endpoints already exist. This spec covers the frontend implementation of these four features using the existing Preact + preact-router stack, Cloudflare Pages Functions backend, and the coral/dark CSS design system.

## Glossary

- **Dashboard**: The authenticated Preact SPA served at `/dashboard/` that provides the user interface for managing OpenCawl features.
- **Call_Page**: The dashboard page at `/dashboard/call` where users initiate and monitor outbound phone calls.
- **Inbound_Config_Page**: The dashboard page at `/dashboard/inbound` where users configure how the AI agent handles incoming calls.
- **Onboarding_Flow**: A multi-step guided setup experience at `/dashboard/onboarding` for new users.
- **Install_Page**: The dashboard page at `/dashboard/install` where users connect or reconnect their agent.
- **Call_Status_Poller**: A client-side polling mechanism that periodically fetches call status from `GET /api/opencawl/status`.
- **Voice_Selector**: A dropdown component that loads voices from `GET /api/voice/library` and allows the user to pick one.
- **Phone_Input**: The existing `PhoneInput` component that accepts and validates E.164 phone numbers using `libphonenumber-js`.
- **Toast**: The existing notification system provided by `useToast()` for displaying success, error, and info messages.
- **Agent_Config**: The user's stored default system prompt, voice ID, and first message, managed via `/api/phone/agent-config`.
- **Accepted_Numbers**: Phone numbers allowed to reach a paid user's inbound agent, managed via `/api/phone/accepted-numbers`.
- **API_Key**: A bearer token generated via `POST /api/keys/create` used to authenticate agent-skill connections.
- **Skill_File**: The `public/opencawl.js` file containing the OpenCawl integration code for connected agents.
- **Router**: The `preact-router` instance in `src/dashboard/app.jsx` that maps URL paths to page components.
- **Layout**: The `Layout` component in `src/dashboard/components/Layout.jsx` that renders the sidebar navigation and main content area.
- **useApi**: The existing `useApi` hook that wraps `fetch` with auth, JSON parsing, loading state, and 401 redirect.
- **useAuth**: The existing `useAuth` hook that provides the authenticated user object and refresh/logout methods.

## Requirements

### Requirement 1: Call Page Route Registration

**User Story:** As a user, I want to navigate to a Make a Call page from the dashboard sidebar, so that I can initiate outbound calls from the UI.

#### Acceptance Criteria

1. THE Router SHALL register a route at `/dashboard/call` that renders the Call_Page component.
2. THE Layout SHALL include a "Make a Call" navigation link in the sidebar that navigates to `/dashboard/call`.
3. WHEN the URL matches `/dashboard/call`, THE Layout SHALL apply the active style to the "Make a Call" sidebar link.

### Requirement 2: Call Initiation Form

**User Story:** As a user, I want to enter a phone number and call goal on the Call_Page, so that I can place an outbound call.

#### Acceptance Criteria

1. THE Call_Page SHALL render a Phone_Input component for entering the destination phone number.
2. THE Call_Page SHALL render a textarea labeled "Goal / Message" for entering the call objective.
3. THE Call_Page SHALL render a "Call Now" button that is disabled when the phone number is empty, the phone number is invalid, or the goal textarea is empty.
4. WHEN the user clicks "Call Now", THE Call_Page SHALL send a POST request to `/api/opencawl/call` with `destination_phone` and `message` fields from the form inputs.
5. WHILE the POST request to `/api/opencawl/call` is in flight, THE "Call Now" button SHALL display "Calling…" and remain disabled.

### Requirement 3: Per-Call Agent Overrides

**User Story:** As a user, I want to optionally override the voice, system prompt, and first message for a specific call, so that I can customize individual calls without changing my defaults.

#### Acceptance Criteria

1. THE Call_Page SHALL render a collapsible "Advanced Options" section below the goal textarea.
2. WHEN the "Advanced Options" section is expanded, THE Call_Page SHALL render a Voice_Selector dropdown, a "System Prompt" textarea, and a "First Message" input field.
3. THE Voice_Selector SHALL load voices from `GET /api/voice/library` and display each voice name in the dropdown.
4. WHEN the user submits the call form with override fields populated, THE Call_Page SHALL include `voice_id`, `system_prompt`, and `first_message` in the POST request body to `/api/opencawl/call`.
5. WHEN the user submits the call form with override fields left empty, THE Call_Page SHALL omit those fields from the POST request body.

### Requirement 4: Live Call Status Polling

**User Story:** As a user, I want to see the real-time status of my call after initiating it, so that I know when the call connects, completes, or fails.

#### Acceptance Criteria

1. WHEN the POST to `/api/opencawl/call` returns a `call_id`, THE Call_Status_Poller SHALL begin polling `GET /api/opencawl/status?call_id={call_id}` every 2 seconds.
2. THE Call_Page SHALL display the current call status as a badge with the label mapped as follows: `pending` → "Queued", `in_progress` → "In Progress", `completed` → "Complete", `failed` → "Failed".
3. WHEN the call status is `completed`, THE Call_Page SHALL display the transcript returned by the status endpoint.
4. WHEN the call status is `completed`, THE Call_Page SHALL display the `duration_seconds` value formatted as `MM:SS`.
5. WHEN the call status reaches a terminal state (`completed` or `failed`), THE Call_Status_Poller SHALL stop polling.
6. WHEN the call status is `failed`, THE Call_Page SHALL display an error message and a "Try Again" button that resets the form to its initial state.

### Requirement 5: Call Initiation Error Handling

**User Story:** As a user, I want to see clear error messages when a call cannot be placed, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. IF the POST to `/api/opencawl/call` returns error code `INSUFFICIENT_CREDITS`, THEN THE Call_Page SHALL display a Toast with the message text from the error response and a link to the Billing page.
2. IF the POST to `/api/opencawl/call` returns error code `INVALID_INPUT`, THEN THE Call_Page SHALL display a Toast with the validation error message from the response.
3. IF the POST to `/api/opencawl/call` returns any other error, THEN THE Call_Page SHALL display a Toast with the error message and re-enable the "Call Now" button.

### Requirement 6: Inbound Config Page Route Registration

**User Story:** As a user, I want to navigate to an Inbound Config page from the dashboard sidebar, so that I can configure how my agent handles incoming calls.

#### Acceptance Criteria

1. THE Router SHALL register a route at `/dashboard/inbound` that renders the Inbound_Config_Page component.
2. THE Layout SHALL include an "Inbound" navigation link in the sidebar that navigates to `/dashboard/inbound`.
3. WHEN the URL matches `/dashboard/inbound`, THE Layout SHALL apply the active style to the "Inbound" sidebar link.

### Requirement 7: Inbound Agent Configuration

**User Story:** As a user, I want to set a system prompt, greeting message, and voice for inbound calls, so that my agent responds appropriately when people call my number.

#### Acceptance Criteria

1. WHEN the Inbound_Config_Page loads, THE Inbound_Config_Page SHALL fetch the current Agent_Config from `GET /api/phone/agent-config` and populate the form fields.
2. THE Inbound_Config_Page SHALL render a textarea labeled "System Prompt / Goal" for entering inbound agent instructions.
3. THE Inbound_Config_Page SHALL render an input field labeled "Greeting Message" for the agent's first spoken message.
4. THE Inbound_Config_Page SHALL render a Voice_Selector dropdown for choosing the inbound call voice.
5. THE Inbound_Config_Page SHALL render a "Save" button that sends a POST request to `/api/phone/agent-config` with the `system_prompt`, `first_message`, and `voice_id` fields.
6. WHEN the save request succeeds, THE Inbound_Config_Page SHALL display a Toast with the message "Configuration saved".
7. IF the save request fails, THEN THE Inbound_Config_Page SHALL display a Toast with the error message from the response.

### Requirement 8: Accepted Numbers Management

**User Story:** As a paid user, I want to manage which phone numbers can reach my inbound agent, so that I can control who has access.

#### Acceptance Criteria

1. WHEN the Inbound_Config_Page loads for a paid user, THE Inbound_Config_Page SHALL fetch and display the list of Accepted_Numbers from `GET /api/phone/accepted-numbers`.
2. THE Inbound_Config_Page SHALL render a Phone_Input and an optional "Label" text input for adding new accepted numbers.
3. WHEN the user submits a new accepted number, THE Inbound_Config_Page SHALL send a POST request to `/api/phone/accepted-numbers` with the phone number and label, then refresh the list.
4. THE Inbound_Config_Page SHALL render a "Remove" button next to each accepted number that sends a DELETE request to `/api/phone/accepted-numbers` with the phone number, then refreshes the list.
5. THE Inbound_Config_Page SHALL display an explanatory note stating that an empty accepted numbers list means any caller can reach the agent.
6. WHILE the user is on the free plan, THE Inbound_Config_Page SHALL hide the Accepted Numbers section and display a message indicating this feature requires a paid plan.

### Requirement 9: Onboarding Flow Route and Redirect

**User Story:** As a new user, I want to be guided through initial setup when I first log in, so that I can get started quickly.

#### Acceptance Criteria

1. THE Router SHALL register a route at `/dashboard/onboarding` that renders the Onboarding_Flow component.
2. WHEN the user object has `onboarding_completed` equal to `false` or `null`, THE Dashboard SHALL redirect the user to `/dashboard/onboarding` on initial load.
3. WHEN the user object has `onboarding_completed` equal to `true`, THE Dashboard SHALL render the normal home page without redirecting.

### Requirement 10: Onboarding Step 1 — Welcome

**User Story:** As a new user, I want to see a welcome screen showing my verified phone number, so that I can confirm my identity before proceeding.

#### Acceptance Criteria

1. THE Onboarding_Flow SHALL display a progress bar showing 4 steps: "Welcome", "Number", "Connect", "Call".
2. WHEN the current step is 1, THE Onboarding_Flow SHALL display the user's verified phone number from the `user.phone` field.
3. WHEN the current step is 1, THE Onboarding_Flow SHALL render a "Get Started" button that advances to step 2.

### Requirement 11: Onboarding Step 2 — Get a Phone Number

**User Story:** As a new user, I want to provision a phone number during onboarding, so that I have a number ready for calls.

#### Acceptance Criteria

1. WHEN the current step is 2, THE Onboarding_Flow SHALL render a "Provision Number" button that sends a POST request to `/api/phone/provision`.
2. WHEN the provision request succeeds and returns a `phone_number`, THE Onboarding_Flow SHALL display the provisioned number and a "Continue" button that advances to step 3.
3. IF the provision request fails, THEN THE Onboarding_Flow SHALL display a Toast with the error message and a "Skip" button that advances to step 3.
4. THE Onboarding_Flow SHALL render a "Skip for now" link that advances to step 3 without provisioning.

### Requirement 12: Onboarding Step 3 — Connect Agent

**User Story:** As a new user, I want to generate an API key and see install instructions, so that I can connect my agent to the platform.

#### Acceptance Criteria

1. WHEN the current step is 3, THE Onboarding_Flow SHALL automatically generate an API_Key by sending a POST request to `/api/keys/create` if no key exists.
2. THE Onboarding_Flow SHALL display the generated API key with a "Copy" button.
3. THE Onboarding_Flow SHALL display the Skill_File content from `public/opencawl.js` in a read-only code block with a "Copy" button.
4. THE Onboarding_Flow SHALL render a "Continue" button that advances to step 4.
5. THE Onboarding_Flow SHALL render a "Skip" link that advances to step 4.

### Requirement 13: Onboarding Step 4 — First Test Call

**User Story:** As a new user, I want to make a test call during onboarding, so that I can verify everything works end to end.

#### Acceptance Criteria

1. WHEN the current step is 4, THE Onboarding_Flow SHALL render the same call form as the Call_Page (phone input pre-filled with `user.phone`, goal textarea, "Call Now" button).
2. WHEN a test call is initiated, THE Onboarding_Flow SHALL use the same Call_Status_Poller behavior as the Call_Page to display live status, transcript, and duration.
3. THE Onboarding_Flow SHALL render a "Finish Setup" button that sets `onboarding_completed` to `true` and redirects to `/dashboard/`.
4. THE Onboarding_Flow SHALL render a "Skip" link that sets `onboarding_completed` to `true` and redirects to `/dashboard/`.

### Requirement 14: Onboarding Progress Persistence

**User Story:** As a new user, I want my onboarding progress to be saved, so that I can resume where I left off if I navigate away.

#### Acceptance Criteria

1. THE Onboarding_Flow SHALL store the current step number in the user record via a backend endpoint or local storage.
2. WHEN the Onboarding_Flow loads, THE Onboarding_Flow SHALL restore the previously saved step number and render that step.

### Requirement 15: Install Page Route Registration

**User Story:** As a user, I want to access an Install/Connect page from the dashboard, so that I can reconnect my agent after initial setup.

#### Acceptance Criteria

1. THE Router SHALL register a route at `/dashboard/install` that renders the Install_Page component.
2. THE Layout SHALL include an "Install" navigation link in the sidebar that navigates to `/dashboard/install`.
3. WHEN the URL matches `/dashboard/install`, THE Layout SHALL apply the active style to the "Install" sidebar link.

### Requirement 16: API Key Generation on Install Page

**User Story:** As a user, I want to generate or view an API key on the Install page, so that I can authenticate my agent connection.

#### Acceptance Criteria

1. WHEN the Install_Page loads, THE Install_Page SHALL fetch existing API keys from `GET /api/keys/list`.
2. THE Install_Page SHALL render a "Generate Setup Key" button that sends a POST request to `/api/keys/create`.
3. WHEN a new key is generated, THE Install_Page SHALL display the full key value with a "Copy" button.
4. THE Install_Page SHALL display a warning that the key is only shown once and cannot be retrieved later.

### Requirement 17: Skill File Display and Copy

**User Story:** As a user, I want to see the platform skill file content and copy it, so that I can manually configure my agent.

#### Acceptance Criteria

1. THE Install_Page SHALL display the content of the Skill_File (`public/opencawl.js`) in a read-only code block.
2. THE Install_Page SHALL render a "Copy" button next to the code block that copies the Skill_File content to the clipboard.
3. WHEN the copy succeeds, THE Install_Page SHALL display a Toast confirming the copy.

### Requirement 18: Onboarding Completed Flag Backend Support

**User Story:** As a developer, I want a backend mechanism to track whether a user has completed onboarding, so that the frontend can conditionally redirect new users.

#### Acceptance Criteria

1. THE Database SHALL include an `onboarding_completed` column on the `users` table with a default value of `false`.
2. WHEN the user completes or skips onboarding, THE Onboarding_Flow SHALL send a request to update `onboarding_completed` to `true` on the user record.
3. THE `/api/auth/me` endpoint SHALL include the `onboarding_completed` field in the user response object.

### Requirement 19: Consistent Visual Design

**User Story:** As a user, I want all new pages to match the existing dashboard look and feel, so that the experience is cohesive.

#### Acceptance Criteria

1. THE Call_Page, Inbound_Config_Page, Onboarding_Flow, and Install_Page SHALL use CSS custom properties from the existing theme (`--bg`, `--bg-card`, `--accent`, `--border`, `--text`, `--text-muted`, `--radius`, `--radius-sm`).
2. THE Call_Page, Inbound_Config_Page, Onboarding_Flow, and Install_Page SHALL use existing component patterns: `.card` for content sections, `.btn-primary` and `.btn-secondary` for buttons, `.form-input` for inputs, and Toast for notifications.
3. THE Call_Page, Inbound_Config_Page, Onboarding_Flow, and Install_Page SHALL be responsive, following the existing breakpoints at 768px and 480px defined in `theme.css`.
