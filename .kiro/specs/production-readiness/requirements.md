# Requirements Document

## Introduction

OpenCawl is a phone platform that connects OpenClaw AI agents to the phone network. This production-readiness spec addresses critical bugs, removes the unused waitlist system, implements goal-based outbound calling via inbound dispatch, adds post-call SMS notifications, aligns pricing and plan gates across all surfaces, fixes paid-plan call entitlement logic, and corrects the onboarding API key display — making the application cohesive, consistent, and ready to ship.

## Glossary

- **Dashboard**: The Preact-based web application at `/dashboard/` where authenticated users manage calls, voices, API keys, phone numbers, and billing
- **Middleware**: The Cloudflare Pages Functions request handler (`functions/_middleware.js`) that enforces authentication on all `/api/*` routes
- **Session_Cookie**: An HttpOnly JWT cookie named `session` set during OTP login, used to authenticate Dashboard requests
- **Bearer_Token**: An API key passed via the `Authorization: Bearer <key>` header, used to authenticate OpenClaw API requests to `/api/openclaw/*`
- **Outbound_Call_API**: The `POST /api/openclaw/call` endpoint that initiates outbound calls via ElevenLabs Conversational AI and Twilio
- **Post_Call_Webhook**: The `POST /api/webhooks/elevenlabs/post-call` endpoint that receives call completion data from ElevenLabs including transcript and duration
- **Tools_Webhook**: The `POST /api/webhooks/elevenlabs/tools` endpoint (currently a 501 stub) intended to handle ElevenLabs tool-call webhooks during conversations
- **Inbound_Router**: The call classification and TwiML-building logic in `functions/lib/inbound-routing.js` and `functions/api/webhooks/twilio/voice.js`
- **Credits_Engine**: The billing logic in `functions/lib/credits.js` that manages free-tier credit pools and paid-tier minute tracking with Stripe metered overage
- **Site_Gate**: The `checkSiteGate()` function in `functions/lib/site-gate.js` that checks waitlist approval status
- **Waitlist**: The system comprising the `waitlist` database table, `/api/waitlist/join` endpoint, `/api/admin/waitlist` endpoints, Site_Gate helper, landing page form, and admin dashboard page
- **Landing_Page**: The public marketing page at `src/landing/index.html` with associated styles and scripts
- **Billing_Page**: The Dashboard page at `src/dashboard/pages/Billing.jsx` that displays plan comparison and usage data
- **Onboarding_Flow**: The four-step guided setup in `src/dashboard/pages/Onboarding.jsx` (Welcome → Phone Number → Connect OpenClaw → Test Call)
- **ElevenLabs**: The third-party voice AI provider used for conversational AI agents, voice synthesis, and outbound calling
- **Twilio**: The third-party telephony provider used for phone number provisioning, SMS, and voice call routing
- **Free_Tier**: The $0 plan with 250 one-time credits, shared phone number, and 5 curated voices
- **Starter_Plan**: The $20/month plan with 100 included minutes, dedicated phone number, full voice library, and voice cloning
- **Pro_Plan**: The $50/month plan with 350 included minutes, dedicated phone number, full voice library, and voice cloning
- **Included_Minutes**: The monthly call minute allowance for paid plans (100 for Starter_Plan, 350 for Pro_Plan) tracked via `period_minutes_used`
- **Goal_Prompt**: A natural language instruction describing what the AI agent should accomplish on an outbound call
- **Task_Dispatch**: The process of receiving a user's Goal_Prompt via inbound call, text, or Slack and dispatching it as an outbound call via ElevenLabs

## Requirements

### Requirement 1: Remove Waitlist System

**User Story:** As a user, I want to access OpenCawl directly without a waitlist gate, so that I can sign up and use the platform immediately.

#### Acceptance Criteria

1. THE Middleware SHALL NOT include `/api/waitlist/join` in its public paths list
2. WHEN a request is made to `/api/waitlist/join`, THE Middleware SHALL return a 404 response
3. WHEN a request is made to `/api/admin/waitlist`, THE Middleware SHALL return a 404 response
4. WHEN a request is made to `/api/admin/waitlist/approve`, THE Middleware SHALL return a 404 response
5. WHEN a request is made to `/api/admin/waitlist/reject`, THE Middleware SHALL return a 404 response
6. THE Landing_Page SHALL NOT contain a waitlist form, waitlist section, or any references to joining a waitlist
7. THE Landing_Page hero call-to-action SHALL link directly to the login page instead of a waitlist anchor
8. THE Landing_Page navigation "Get Started" button SHALL link directly to the login page
9. THE Landing_Page pricing card buttons SHALL link directly to the login page
10. THE Landing_Page script SHALL NOT contain waitlist form submission logic
11. THE Site_Gate module (`functions/lib/site-gate.js`) SHALL be deleted from the codebase
12. THE Landing_Page FAQ answer about availability SHALL NOT reference a waitlist
13. THE Landing_Page SHALL NOT contain the waitlist section element with id "waitlist"

### Requirement 2: Fix Dashboard Outbound Call Authentication

**User Story:** As a Dashboard user, I want to make outbound calls from the "Make a Call" page, so that I can use the flagship feature without needing an external API client.

#### Acceptance Criteria

1. WHEN a request to `/api/openclaw/call` includes a valid Session_Cookie and no Bearer_Token, THE Middleware SHALL authenticate the request using the Session_Cookie and attach the user to the request context
2. WHEN a request to `/api/openclaw/status` includes a valid Session_Cookie and no Bearer_Token, THE Middleware SHALL authenticate the request using the Session_Cookie and attach the user to the request context
3. WHEN a request to `/api/openclaw/credits` includes a valid Session_Cookie and no Bearer_Token, THE Middleware SHALL authenticate the request using the Session_Cookie and attach the user to the request context
4. WHEN a request to any `/api/openclaw/*` route includes a valid Bearer_Token, THE Middleware SHALL authenticate the request using the Bearer_Token (preserving existing API key auth)
5. WHEN a request to any `/api/openclaw/*` route includes neither a valid Session_Cookie nor a valid Bearer_Token, THE Middleware SHALL return a 401 UNAUTHORIZED response
6. WHEN the Dashboard Call page submits a call request, THE Outbound_Call_API SHALL create a call record and initiate the ElevenLabs outbound call using the session-authenticated user
7. WHEN the Dashboard Call page polls for call status, THE Outbound_Call_API status endpoint SHALL return the call status for the session-authenticated user

### Requirement 3: Goal-Based Outbound Calling via Inbound Dispatch

**User Story:** As a user, I want to call, text, or message my OpenCawl number with a task instruction, so that OpenCawl dispatches an AI agent to make an outbound call and complete the task on my behalf.

#### Acceptance Criteria

1. WHEN an owner calls their OpenCawl number and provides a Goal_Prompt, THE Inbound_Router SHALL classify the call as an owner instruction call
2. WHEN an owner instruction call is received, THE Task_Dispatch system SHALL extract the Goal_Prompt from the conversation transcript
3. WHEN a Goal_Prompt is extracted, THE Task_Dispatch system SHALL create a new outbound call record with the goal, destination phone number, and the owner's user ID
4. WHEN a Task_Dispatch outbound call is created, THE Outbound_Call_API SHALL initiate an ElevenLabs outbound call with the Goal_Prompt as the agent's objective
5. WHEN an owner sends an SMS to their OpenCawl number containing a Goal_Prompt, THE Task_Dispatch system SHALL parse the message and initiate the outbound call flow
6. IF the Goal_Prompt does not contain a recognizable destination phone number, THEN THE Task_Dispatch system SHALL reply to the user requesting clarification
7. IF the Task_Dispatch outbound call fails to initiate, THEN THE Task_Dispatch system SHALL notify the user of the failure via SMS
8. THE Tools_Webhook SHALL handle ElevenLabs tool-call requests for task dispatch operations instead of returning a 501 status

### Requirement 4: Post-Call SMS Notification

**User Story:** As a user, I want to receive an SMS summary when my AI agent completes a call, so that I know the outcome without checking the dashboard.

#### Acceptance Criteria

1. WHEN the Post_Call_Webhook receives a completed call event with a transcript, THE Post_Call_Webhook SHALL send an SMS to the call owner's phone number with a summary of the call outcome
2. THE SMS summary SHALL contain the destination phone number that was called and a concise description of the outcome derived from the transcript
3. THE SMS summary SHALL be 160 characters or fewer to fit in a single SMS segment
4. IF the Post_Call_Webhook fails to send the SMS, THEN THE Post_Call_Webhook SHALL log the failure and continue processing the webhook without returning an error
5. IF the call transcript is empty or missing, THEN THE Post_Call_Webhook SHALL send an SMS stating the call was completed without a transcript available
6. THE Post_Call_Webhook SHALL send the SMS via the Twilio messaging API using the user's OpenCawl phone number as the sender

### Requirement 5: Align Pricing and Plan Gates

**User Story:** As a user, I want to see consistent plan features across the landing page, billing page, and backend enforcement, so that I know exactly what each plan includes.

#### Acceptance Criteria

1. THE Landing_Page pricing section SHALL display Free_Tier with 250 one-time credits, shared phone number, and 5 curated voices
2. THE Landing_Page pricing section SHALL display Starter_Plan with 100 included minutes per month, dedicated phone number, full voice library, and voice cloning
3. THE Landing_Page pricing section SHALL display Pro_Plan with 350 included minutes per month, dedicated phone number, full voice library, and voice cloning
4. THE Billing_Page plan comparison SHALL display the same feature lists as the Landing_Page pricing section for all three plans
5. WHEN a Starter_Plan user requests voice cloning, THE voice clone endpoint SHALL allow the request (not restrict cloning to Pro_Plan only)
6. WHEN a Free_Tier user requests voice cloning, THE voice clone endpoint SHALL return a 403 FORBIDDEN response indicating that voice cloning requires a paid plan
7. THE Landing_Page pricing section SHALL display credits information using "minutes" terminology for paid plans instead of "credits"

### Requirement 6: Fix Paid-Plan Call Entitlement

**User Story:** As a paid-plan user, I want my outbound calls to check against my included minutes instead of the credit pool, so that my subscription benefits are properly applied.

#### Acceptance Criteria

1. WHEN a Free_Tier user initiates an outbound call, THE Outbound_Call_API SHALL verify the user has at least 12 credits in their credit balance before proceeding
2. WHEN a Starter_Plan user initiates an outbound call, THE Outbound_Call_API SHALL verify the user has remaining Included_Minutes (period_minutes_used less than 100) or that Stripe metered overage is available
3. WHEN a Pro_Plan user initiates an outbound call, THE Outbound_Call_API SHALL verify the user has remaining Included_Minutes (period_minutes_used less than 350) or that Stripe metered overage is available
4. WHEN a paid-plan user has exceeded their Included_Minutes, THE Outbound_Call_API SHALL allow the call to proceed because overage is billed via Stripe metered billing
5. THE Outbound_Call_API SHALL NOT check `credits_balance` for Starter_Plan or Pro_Plan users

### Requirement 7: Fix Onboarding API Key Display

**User Story:** As a new user going through onboarding, I want to see and copy my full API key, so that I can use it to connect my OpenClaw agent.

#### Acceptance Criteria

1. WHEN the Onboarding_Flow detects an existing API key, THE Onboarding_Flow SHALL display a message indicating the key was previously generated and cannot be shown again
2. WHEN the Onboarding_Flow detects an existing API key, THE Onboarding_Flow SHALL NOT display the key prefix with an ellipsis as if it were a copyable credential
3. WHEN the Onboarding_Flow generates a new API key, THE Onboarding_Flow SHALL display the full key and allow the user to copy it
4. WHEN the Onboarding_Flow detects an existing API key, THE Onboarding_Flow SHALL offer a "Regenerate Key" action that revokes the old key and creates a new one, displaying the full new key
5. THE Onboarding_Flow SHALL display a warning that the full API key is shown only once and cannot be retrieved later

### Requirement 8: Landing Page Production Polish

**User Story:** As a visitor, I want the landing page to accurately represent the live product, so that I understand what OpenCawl does and can sign up immediately.

#### Acceptance Criteria

1. THE Landing_Page hero subtitle SHALL accurately describe the current product capabilities without referencing features that are not yet implemented
2. THE Landing_Page "You call your Claw" demo section SHALL describe the inbound dispatch flow accurately, including that the user receives an SMS notification when the task is complete
3. THE Landing_Page "Your Claw calls the world" demo section SHALL describe the outbound calling flow accurately
4. THE Landing_Page features section voice card SHALL state "5 curated voices" for free users and mention voice cloning for paid plans
5. THE Landing_Page FAQ answer about "When will it be available?" SHALL state that OpenCawl is live and available for sign-up, removing references to waitlist and development status
6. THE Landing_Page footer copyright year SHALL be current
