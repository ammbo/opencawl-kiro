# Requirements Document

## Introduction

OpenCawl Phone Platform (OpenCawl.ai) is a full-stack application that gives connected AI agents phone calling capabilities. Users sign up via SMS OTP, receive a phone number, and can make and receive calls through their agent using voice AI powered by ElevenLabs. The platform runs entirely on Cloudflare Pages Functions with zero backend dependencies, using pure Web APIs for all cryptographic and HTTP operations.

The system encompasses user authentication, credit-based billing, Twilio phone integration, ElevenLabs voice AI, a Preact SPA dashboard, a marketing landing page, and an OpenCawl integration API for connected agents.

## Glossary

- **Platform**: The OpenCawl Phone Platform application as a whole, including frontend, backend, and all integrations
- **Auth_Service**: The authentication subsystem handling SMS OTP verification, JWT session management, and API key validation
- **Credit_Engine**: The subsystem responsible for credit balance tracking, atomic deductions, and transaction ledger management
- **Phone_Service**: The subsystem managing Twilio phone number provisioning, inbound/outbound call routing, and SMS delivery
- **Voice_Service**: The subsystem managing ElevenLabs Conversational AI agent configuration, voice library, and voice cloning
- **Billing_Service**: The subsystem handling Stripe Checkout sessions, subscription management, and plan upgrades/downgrades
- **Dashboard**: The Preact SPA providing the user interface for call logs, voice selection, API key management, billing, and settings
- **Landing_Page**: The vanilla HTML/CSS/JS marketing site with waitlist functionality and site-gate verification
- **OpenCawl_API**: The REST API endpoints consumed by connected agents to trigger calls, check status, and query credits
- **Webhook_Handler**: The subsystem processing incoming webhooks from Stripe, Twilio, and ElevenLabs
- **Admin_Panel**: The dashboard section restricted to administrators for viewing user stats, managing waitlists, and user administration
- **User**: A person who has completed SMS OTP verification and has an active account on the Platform
- **Connected_Agent**: An external AI agent that integrates with the Platform via API keys to make and receive phone calls
- **Credit**: The unit of metering for Platform usage; calls cost 12 credits per minute, SMS costs 2 credits, intent classification costs 1 credit
- **API_Key**: A SHA-256 hashed Bearer token issued to a User for authenticating Connected_Agent requests
- **Site_Gate**: The verification step requiring phone number validation (via waitlist approval or invite code) before granting dashboard access
- **Free_Tier**: The plan providing 250 one-time credits with no renewal and access to a shared phone number pool
- **Starter_Plan**: The paid plan at $20/month providing 1200 monthly credits and a dedicated phone number
- **Pro_Plan**: The paid plan at $50/month providing 4200 monthly credits, a dedicated phone number, and voice cloning access
- **D1_Database**: The Cloudflare D1 SQLite database storing all Platform data
- **Credit_Transaction**: An append-only ledger entry recording each credit deduction or addition with timestamp and reason

## Requirements

### Requirement 1: SMS OTP Authentication

**User Story:** As a User, I want to log in using my phone number and a one-time SMS code, so that I can securely access the Platform without needing a password.

#### Acceptance Criteria

1. WHEN a User submits a valid phone number to the `/api/auth/send-code` endpoint, THE Auth_Service SHALL send a verification code via the Twilio Verify API and return a 200 status code
2. WHEN a User submits a valid verification code to the `/api/auth/verify-code` endpoint, THE Auth_Service SHALL create a JWT session token, set it in an HttpOnly secure cookie, and return the authenticated User profile
3. IF a User submits an invalid or expired verification code, THEN THE Auth_Service SHALL return a 401 status code with a descriptive error message
4. IF a User submits a malformed phone number, THEN THE Auth_Service SHALL return a 400 status code with a validation error message
5. WHEN a User calls the `/api/auth/me` endpoint with a valid session cookie, THE Auth_Service SHALL return the current User profile including phone, plan, credits_balance, and voice_id
6. WHEN a User calls the `/api/auth/logout` endpoint, THE Auth_Service SHALL invalidate the session and clear the session cookie
7. THE Auth_Service SHALL generate JWT tokens using the crypto.subtle Web API with HMAC-SHA256 signing, without external dependencies

### Requirement 2: Site-Gate and Waitlist Access Control

**User Story:** As a platform operator, I want to restrict dashboard access to approved users, so that I can manage a controlled rollout via waitlist or invite codes.

#### Acceptance Criteria

1. WHEN a visitor submits their phone number to the `/api/waitlist/join` endpoint, THE Platform SHALL store the phone number in the waitlist table with a pending status and a timestamp
2. WHEN an authenticated User attempts to access the Dashboard, THE Platform SHALL verify the User's phone number is approved in the waitlist or has a valid invite code before granting access
3. IF an authenticated User has not passed the Site_Gate verification, THEN THE Platform SHALL redirect the User to the site-gate verification page
4. WHEN an administrator approves a waitlist entry via the Admin_Panel, THE Platform SHALL update the waitlist status to approved, allowing the associated phone number to pass the Site_Gate

### Requirement 3: User Account and Session Management

**User Story:** As a User, I want my account to be automatically created upon first login, so that I can start using the Platform immediately after verification.

#### Acceptance Criteria

1. WHEN a new phone number completes OTP verification for the first time, THE Auth_Service SHALL create a new User record with the Free_Tier plan, 250 initial credits, and a null voice_id
2. WHEN a returning User completes OTP verification, THE Auth_Service SHALL retrieve the existing User record and create a new session
3. THE Auth_Service SHALL store sessions in the D1_Database sessions table with a user_id, token hash, and expiration timestamp
4. WHEN a session token expires, THE Auth_Service SHALL reject requests with a 401 status code and clear the session cookie

### Requirement 4: API Key Management

**User Story:** As a User, I want to generate and manage API keys, so that my Connected_Agent can authenticate with the Platform.

#### Acceptance Criteria

1. WHEN a User requests a new API key via the `/api/keys/create` endpoint, THE Auth_Service SHALL generate a cryptographically random token, store its SHA-256 hash in the api_keys table, and return the plaintext token exactly once
2. WHEN a User calls the `/api/keys/list` endpoint, THE Auth_Service SHALL return a list of the User's API keys showing only the key prefix, creation date, and active status
3. WHEN a User calls the `/api/keys/revoke` endpoint with a valid key ID, THE Auth_Service SHALL mark the API key as revoked and immediately reject subsequent requests using that key
4. WHEN a Connected_Agent sends a request with a Bearer token in the Authorization header, THE Auth_Service SHALL hash the token with SHA-256, look up the hash in the api_keys table, and authenticate the request if a matching active key is found
5. IF a Connected_Agent sends a request with an invalid or revoked API key, THEN THE Auth_Service SHALL return a 401 status code

### Requirement 5: Credit System and Transaction Ledger

**User Story:** As a User, I want a transparent credit-based system for tracking my Platform usage, so that I understand exactly how my credits are consumed.

#### Acceptance Criteria

1. THE Credit_Engine SHALL deduct 12 credits per minute for voice calls, 2 credits per SMS message, and 1 credit per intent classification operation
2. WHEN a credit-consuming operation occurs, THE Credit_Engine SHALL atomically deduct the cost from the User's credits_balance and insert an append-only record into the credit_transactions table within a single database transaction
3. IF a User's credits_balance is less than the cost of a requested operation, THEN THE Credit_Engine SHALL reject the operation with a 402 Payment Required status code
4. WHEN a User's credits_balance drops below 50 credits, THE Credit_Engine SHALL send a low-balance notification SMS to the User's phone number
5. WHEN a User's credits_balance drops below 20 credits, THE Credit_Engine SHALL send a critical-balance notification SMS to the User's phone number
6. THE Credit_Engine SHALL record each Credit_Transaction with the user_id, amount, operation type, reference ID, and timestamp
7. FOR ALL credit operations, THE Credit_Engine SHALL ensure that the sum of all Credit_Transaction amounts for a User equals the difference between the User's initial credits and current credits_balance (ledger consistency property)

### Requirement 6: Subscription Billing and Plan Management

**User Story:** As a User, I want to upgrade my plan and manage my subscription, so that I can get more credits and features.

#### Acceptance Criteria

1. WHEN a User initiates a plan upgrade via the `/api/billing/checkout` endpoint, THE Billing_Service SHALL create a Stripe Checkout session using the fetch API and return the checkout URL
2. WHEN Stripe sends a `checkout.session.completed` webhook to `/api/webhooks/stripe`, THE Billing_Service SHALL update the User's plan and add the corresponding credits to the User's credits_balance
3. WHEN Stripe sends a `customer.subscription.updated` webhook, THE Billing_Service SHALL update the User's plan to reflect the new subscription status
4. WHEN Stripe sends a `customer.subscription.deleted` webhook, THE Billing_Service SHALL downgrade the User to the Free_Tier plan
5. WHEN a User calls the `/api/billing/portal` endpoint, THE Billing_Service SHALL create a Stripe Customer Portal session and return the portal URL for subscription management
6. WHEN a User calls the `/api/billing/usage` endpoint, THE Billing_Service SHALL return the User's credit usage history grouped by day for the current billing period
7. THE Billing_Service SHALL interact with Stripe using raw fetch API calls without the Stripe SDK

### Requirement 7: Phone Number Provisioning and Management

**User Story:** As a User, I want to get a phone number for my agent, so that I can make and receive calls.

#### Acceptance Criteria

1. WHEN a paid-plan User requests a phone number via the `/api/phone/provision` endpoint, THE Phone_Service SHALL provision a new Twilio phone number, assign it to the User, and configure the Twilio webhooks to point to the Platform's webhook endpoints
2. WHILE a User is on the Free_Tier, THE Phone_Service SHALL assign each user a number from a shared pool of Twilio phone numbers instead of provisioning a dedicated number
3. WHEN a User calls the `/api/phone/configure` endpoint, THE Phone_Service SHALL update the Twilio number's webhook configuration and voicemail settings as specified
4. IF the Twilio API returns an error during phone number provisioning, THEN THE Phone_Service SHALL return a descriptive error message and not charge the User

### Requirement 8: Outbound Call Flow

**User Story:** As a Connected_Agent operator, I want to trigger outbound phone calls via the API, so that my AI agent can call people on my behalf.

#### Acceptance Criteria

1. WHEN a Connected_Agent sends a POST request to `/api/opencawl/call` with a valid API key, destination phone number, and message context, THE OpenCawl_API SHALL create a call record in the calls table with a pending status and return the call ID
2. WHEN a call record is created, THE Phone_Service SHALL invoke an ElevenLabs Conversational AI agent overridden with the User's selected voice and initiate an outbound call via Twilio to the destination number
3. WHEN the outbound call completes, THE Webhook_Handler SHALL process the ElevenLabs post-call webhook, log the transcript in the call record, and trigger the Credit_Engine to charge credits based on call duration
4. IF the User's credits_balance is insufficient before initiating the call, THEN THE OpenCawl_API SHALL reject the request with a 402 Payment Required status code without creating a call record
5. WHEN a Connected_Agent calls `/api/opencawl/status` with a call ID, THE OpenCawl_API SHALL return the current call status, duration, and transcript if available

### Requirement 9: Inbound Call Flow

**User Story:** As a User, I want my Twilio number to receive calls and have my AI agent respond, so that callers can interact with my connected agent.

#### Acceptance Criteria

1. WHEN a call is received on a User's Twilio phone number, THE Webhook_Handler SHALL receive the Twilio voice webhook and route the call to an ElevenLabs Conversational AI agent configured with the User's selected voice
2. WHEN the ElevenLabs agent needs to dispatch a task during an inbound call, THE Voice_Service SHALL send the task to the task gateway via the dispatch-task custom tool and wait for the completion callback
3. WHEN the inbound call completes, THE Webhook_Handler SHALL process the ElevenLabs post-call webhook, log the transcript, charge credits based on call duration, and notify the User
4. IF the User's credits_balance is insufficient to continue an inbound call, THEN THE Phone_Service SHALL play a low-credit notification to the caller and end the call gracefully

### Requirement 10: Voice Library and Selection

**User Story:** As a User, I want to browse and select from curated AI voices, so that I can customize how my connected agent sounds on calls.

#### Acceptance Criteria

1. WHEN a User calls the `/api/voice/library` endpoint, THE Voice_Service SHALL return a list of 20 curated ElevenLabs voices with name, description, gender, accent, and preview audio URL
2. WHEN a User calls the `/api/voice/preview` endpoint with a voice ID, THE Voice_Service SHALL return a sample audio clip of the specified voice
3. WHEN a User calls the `/api/voice/select` endpoint with a voice ID, THE Voice_Service SHALL update the User's voice_id in the users table
4. WHERE a User is on the Pro_Plan, THE Voice_Service SHALL allow the User to clone a custom voice via the `/api/voice/clone` endpoint using the ElevenLabs voice cloning API
5. IF a User on the Free_Tier or Starter_Plan attempts to clone a voice, THEN THE Voice_Service SHALL return a 403 status code indicating voice cloning requires the Pro_Plan

### Requirement 11: Dashboard Application

**User Story:** As a User, I want a web dashboard to manage my account, view call history, and configure my phone integration.

#### Acceptance Criteria

1. THE Dashboard SHALL be built as a Preact SPA using preact-router with Vite as the build tool
2. WHEN a User navigates to the Dashboard home page, THE Dashboard SHALL display a call log table, a credit balance card, and quick action buttons
3. WHEN a User navigates to the Voice page, THE Dashboard SHALL display a grid of voice cards with preview playback and a select button for each voice
4. WHEN a User navigates to the Keys page, THE Dashboard SHALL display a list of API keys with prefix, creation date, and a revoke button, plus a button to generate a new key
5. WHEN a User navigates to the Phone page, THE Dashboard SHALL display the User's provisioned phone number and configuration options, or a provision button if no number is assigned
6. WHEN a User navigates to the Billing page, THE Dashboard SHALL display plan cards with upgrade CTAs, a usage chart, and a link to the Stripe Customer Portal
7. WHEN a User navigates to the Settings page, THE Dashboard SHALL display account details and a logout button
8. THE Dashboard SHALL support dark and light themes via CSS custom properties
9. THE Dashboard SHALL display toast notifications for success and error states
10. THE Dashboard SHALL use modal dialogs for destructive actions such as revoking API keys
11. THE Dashboard SHALL be responsive with a mobile-first design approach

### Requirement 12: Landing Page and Marketing Site

**User Story:** As a visitor, I want to learn about the OpenCawl Phone Platform and join the waitlist, so that I can get access when available.

#### Acceptance Criteria

1. THE Landing_Page SHALL be built with vanilla HTML, CSS, and JavaScript without framework dependencies
2. THE Landing_Page SHALL display a hero section, features section, pricing section, and a waitlist join form
3. WHEN a visitor submits the waitlist form with a valid phone number, THE Landing_Page SHALL send the phone number to the `/api/waitlist/join` endpoint and display a success confirmation
4. IF a visitor submits the waitlist form with an invalid phone number, THEN THE Landing_Page SHALL display a client-side validation error
5. THE Landing_Page SHALL use a clean, modern design

### Requirement 13: Admin Panel

**User Story:** As an administrator, I want to view platform statistics and manage users and the waitlist, so that I can operate the Platform effectively.

#### Acceptance Criteria

1. WHEN an administrator navigates to the Admin_Panel, THE Dashboard SHALL display stats cards showing total users, active calls, total credits consumed, and revenue metrics
2. WHEN an administrator views the users section, THE Admin_Panel SHALL display a table of all users with phone, plan, credits_balance, and account creation date
3. WHEN an administrator views the waitlist section, THE Admin_Panel SHALL display a table of waitlist entries with phone number, status, and submission date, with approve and reject actions
4. IF a non-administrator User attempts to access the `/api/admin/*` endpoints, THEN THE Auth_Service SHALL return a 403 Forbidden status code
5. THE Auth_Service SHALL determine administrator status from the is_admin flag on the User record

### Requirement 14: Database Schema and Migrations

**User Story:** As a developer, I want a well-defined database schema, so that all Platform data is stored consistently and can be migrated reliably.

#### Acceptance Criteria

1. THE D1_Database SHALL contain the following tables: users, api_keys, otp_codes, credit_transactions, calls, sessions, and waitlist
2. THE D1_Database users table SHALL store id, phone, plan, credits_balance, voice_id, twilio_phone_number, is_admin, stripe_customer_id, created_at, and updated_at columns
3. THE D1_Database api_keys table SHALL store id, user_id, key_hash, key_prefix, is_active, created_at, and revoked_at columns
4. THE D1_Database credit_transactions table SHALL be append-only, storing id, user_id, amount, operation_type, reference_id, and created_at columns
5. THE D1_Database calls table SHALL store id, user_id, direction, destination_phone, status, duration_seconds, transcript, elevenlabs_conversation_id, created_at, and updated_at columns
6. THE Platform SHALL manage database schema changes via `wrangler d1 migrations apply`

### Requirement 15: Webhook Processing

**User Story:** As a platform operator, I want reliable webhook processing, so that external service events are handled correctly and consistently.

#### Acceptance Criteria

1. WHEN Stripe sends a webhook to `/api/webhooks/stripe`, THE Webhook_Handler SHALL verify the webhook signature before processing the event
2. WHEN Twilio sends a voice webhook to `/api/webhooks/twilio/voice`, THE Webhook_Handler SHALL validate the request signature and route the call to the appropriate ElevenLabs agent
3. WHEN ElevenLabs sends a post-call webhook to `/api/webhooks/elevenlabs/post-call`, THE Webhook_Handler SHALL log the call transcript, update the call record status, and trigger credit deduction
4. WHEN ElevenLabs sends a tool-call webhook to `/api/webhooks/elevenlabs/tools`, THE Webhook_Handler SHALL dispatch the task to the task gateway and return the task result to the ElevenLabs agent
5. IF a webhook request fails signature verification, THEN THE Webhook_Handler SHALL return a 401 status code and log the failed verification attempt

### Requirement 16: OpenCawl Skill File

**User Story:** As a Connected_Agent developer, I want a drop-in skill file, so that I can easily integrate phone capabilities into my agent.

#### Acceptance Criteria

1. THE Platform SHALL provide an `opencawl.js` skill file that exports `make_call(to, message)`, `check_call_status(call_id)`, and `get_credits()` functions
2. WHEN `make_call` is invoked, THE skill file SHALL send a POST request to `/api/opencawl/call` with the API key from configuration and return the call ID
3. WHEN `check_call_status` is invoked, THE skill file SHALL send a GET request to `/api/opencawl/status` with the call ID and return the call status object
4. WHEN `get_credits` is invoked, THE skill file SHALL send a GET request to `/api/opencawl/credits` and return the current credit balance
5. THE skill file SHALL authenticate all requests using a Bearer token in the Authorization header

### Requirement 17: Cloudflare Deployment Architecture

**User Story:** As a developer, I want the Platform to run entirely on Cloudflare infrastructure, so that deployment is simple and there are no traditional server dependencies.

#### Acceptance Criteria

1. THE Platform SHALL run all backend logic as Cloudflare Pages Functions using ES module syntax
2. THE Platform SHALL use only Web APIs (crypto.subtle, fetch, Response, Request) without Node.js runtime dependencies
3. THE Platform SHALL use Cloudflare D1 bindings via wrangler.toml for database access
4. THE Platform SHALL use a multi-page Vite build configuration with separate entry points for the Landing_Page, login page, and Dashboard
5. THE Platform SHALL use a `_redirects` file to route all `/dashboard/*` paths to the Dashboard SPA entry point for client-side routing
6. THE Platform SHALL store secrets in `.dev.vars` for local development and Cloudflare Pages environment variables for production
7. THE Platform SHALL be deployable via `wrangler pages deploy`

### Requirement 18: Middleware and Security

**User Story:** As a platform operator, I want consistent authentication and security middleware, so that all endpoints are properly protected.

#### Acceptance Criteria

1. THE Platform SHALL implement a middleware layer that authenticates Dashboard requests via session cookies and OpenCawl_API requests via Bearer tokens
2. WHEN a request to a protected Dashboard endpoint lacks a valid session cookie, THE Auth_Service SHALL return a 401 status code
3. WHEN a request to a protected OpenCawl_API endpoint lacks a valid Bearer token, THE Auth_Service SHALL return a 401 status code
4. THE Auth_Service SHALL set JWT cookies with HttpOnly, Secure, and SameSite=Strict attributes
5. THE Platform SHALL validate and sanitize all user inputs at every API endpoint to prevent injection attacks
