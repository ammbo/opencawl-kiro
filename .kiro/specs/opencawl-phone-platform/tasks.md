# Implementation Plan: OpenCawl Phone Platform

## Overview

This plan implements the OpenCawl Phone Platform as a full-stack Cloudflare Pages application with Preact dashboard, vanilla landing page, and zero-dependency backend functions. Tasks are ordered to build foundational layers first (database, auth, middleware), then core business logic (credits, billing, phone, voice), then integration points (webhooks, OpenCawl API), and finally the frontend and wiring.

## Tasks

- [x] 1. Project scaffolding and database schema
  - [x] 1.1 Initialize project structure with Vite, Preact, and Cloudflare Pages Functions
    - Create `wrangler.toml` with D1 binding configuration
    - Create `vite.config.js` with multi-page build (landing, login, dashboard entry points)
    - Create `package.json` with Preact, Vite, Vitest, and fast-check dependencies
    - Create `.dev.vars.example` documenting all required environment variables
    - Create `_redirects` file routing `/dashboard/*` to the Dashboard SPA entry point
    - Set up `functions/` directory for Pages Functions and `src/` for frontend code
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 1.2 Create D1 database migration files
    - Create `migrations/0001_create_users.sql` with users table (id, phone, plan, credits_balance, voice_id, twilio_phone_number, is_admin, stripe_customer_id, created_at, updated_at)
    - Create `migrations/0002_create_api_keys.sql` with api_keys table (id, user_id, key_hash, key_prefix, is_active, created_at, revoked_at)
    - Create `migrations/0003_create_sessions.sql` with sessions table (id, user_id, token_hash, expires_at, created_at)
    - Create `migrations/0004_create_credit_transactions.sql` with append-only credit_transactions table (id, user_id, amount, operation_type, reference_id, created_at)
    - Create `migrations/0005_create_calls.sql` with calls table (id, user_id, direction, destination_phone, status, duration_seconds, transcript, elevenlabs_conversation_id, created_at, updated_at)
    - Create `migrations/0006_create_waitlist.sql` with waitlist table (id, phone, status, invite_code, created_at)
    - Add appropriate indexes and unique constraints
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 2. Core utility libraries
  - [x] 2.1 Implement input validation library (`functions/lib/validation.js`)
    - Implement E.164 phone number validation (+ prefix, 1-15 digits)
    - Implement input sanitization against SQL injection and XSS patterns
    - Implement generic request body parser with required field validation
    - _Requirements: 1.4, 18.5_

  - [ ]* 2.2 Write property test: Phone number validation (Property 1)
    - **Property 1: Phone number validation rejects non-E.164 strings**
    - **Validates: Requirements 1.4**

  - [ ]* 2.3 Write property test: Input sanitization (Property 10)
    - **Property 10: Input sanitization against injection**
    - **Validates: Requirements 18.5**

  - [x] 2.4 Implement JWT utilities (`functions/lib/jwt.js`)
    - Implement JWT signing with HMAC-SHA256 via `crypto.subtle.importKey` and `crypto.subtle.sign`
    - Implement JWT verification with `crypto.subtle.verify` and expiration check
    - Implement base64url encoding/decoding helpers
    - Use only Web Crypto API, no external dependencies
    - _Requirements: 1.7, 3.4_

  - [ ]* 2.5 Write property test: JWT sign/verify round-trip (Property 2)
    - **Property 2: JWT sign/verify round-trip with expiration enforcement**
    - **Validates: Requirements 1.7, 3.4**

  - [x] 2.6 Implement API key utilities (`functions/lib/api-keys.js`)
    - Implement key generation using `crypto.getRandomValues(new Uint8Array(32))` → hex string
    - Implement SHA-256 hashing via `crypto.subtle.digest`
    - Implement prefix extraction (first 8 chars)
    - _Requirements: 4.1, 4.4_

  - [ ]* 2.7 Write property test: API key hash round-trip (Property 3)
    - **Property 3: API key hash round-trip**
    - **Validates: Requirements 4.1, 4.4, 4.5**

  - [ ]* 2.8 Write property test: Revoked API key rejection (Property 4)
    - **Property 4: Revoked API key authentication rejection**
    - **Validates: Requirements 4.3**

  - [x] 2.9 Implement webhook signature verification (`functions/lib/webhooks.js`)
    - Implement Stripe webhook HMAC-SHA256 signature verification via `crypto.subtle`
    - Implement Twilio request signature validation
    - Implement ElevenLabs shared secret verification
    - _Requirements: 15.1, 15.2, 15.5_

  - [ ]* 2.10 Write property test: Webhook signature verification (Property 9)
    - **Property 9: Webhook signature verification**
    - **Validates: Requirements 15.1, 15.2, 15.5**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Credit engine and billing
  - [x] 4.1 Implement Credit Engine (`functions/lib/credits.js`)
    - Implement `deduct(db, userId, amount, operationType, referenceId)` with atomic D1 batch (UPDATE users + INSERT credit_transactions)
    - Implement `check(db, userId, requiredAmount)` for balance sufficiency check
    - Implement `add(db, userId, amount, operationType, referenceId)` for credit additions
    - Implement `getTransactions(db, userId, limit, offset)` for transaction history
    - Implement credit rate calculation: 12 credits/min for calls (ceil), 2/SMS, 1/intent
    - Implement low-balance (< 50) and critical-balance (< 20) SMS notification triggers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 4.2 Write property test: Credit rate calculation (Property 5)
    - **Property 5: Credit rate calculation correctness**
    - **Validates: Requirements 5.1**

  - [ ]* 4.3 Write property test: Credit ledger consistency (Property 6)
    - **Property 6: Credit ledger consistency invariant**
    - **Validates: Requirements 5.2, 5.7**

  - [ ]* 4.4 Write property test: Insufficient credits rejection (Property 7)
    - **Property 7: Insufficient credits rejection**
    - **Validates: Requirements 5.3**

  - [x] 4.5 Implement usage aggregation (`functions/lib/usage.js`)
    - Implement daily grouping of credit transactions within a billing period
    - Return daily totals array for usage chart rendering
    - _Requirements: 6.6_

  - [ ]* 4.6 Write property test: Daily usage aggregation (Property 8)
    - **Property 8: Daily usage aggregation correctness**
    - **Validates: Requirements 6.6**

- [x] 5. Middleware and auth endpoints
  - [x] 5.1 Implement middleware layer (`functions/_middleware.js`)
    - Route public endpoints (send-code, verify-code, waitlist/join, webhooks) without auth
    - Validate JWT session cookies for dashboard endpoints and attach user to `context.data`
    - Validate Bearer token (SHA-256 hash lookup) for `/api/opencawl/*` endpoints
    - Check `is_admin` flag for `/api/admin/*` endpoints, return 403 if not admin
    - Set consistent error response format for auth failures
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 13.4, 13.5_

  - [x] 5.2 Implement auth endpoints (`functions/api/auth/`)
    - Implement `POST /api/auth/send-code`: validate phone, call Twilio Verify API via fetch, return 200
    - Implement `POST /api/auth/verify-code`: verify OTP via Twilio, create/retrieve user, generate JWT, set HttpOnly/Secure/SameSite=Strict cookie
    - Implement `GET /api/auth/me`: return user profile (phone, plan, credits_balance, voice_id)
    - Implement `POST /api/auth/logout`: delete session from D1, clear cookie
    - Auto-create new users on first login with Free_Tier, 250 credits, null voice_id
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3_

  - [x] 5.3 Implement waitlist endpoints (`functions/api/waitlist/`)
    - Implement `POST /api/waitlist/join`: store phone with pending status and timestamp
    - Implement site-gate check logic: verify phone is approved or has valid invite code
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. API key and phone management endpoints
  - [x] 6.1 Implement API key endpoints (`functions/api/keys/`)
    - Implement `POST /api/keys/create`: generate key, store SHA-256 hash + prefix, return plaintext once
    - Implement `GET /api/keys/list`: return keys with prefix, creation date, active status (no full key)
    - Implement `POST /api/keys/revoke`: mark key as revoked, set revoked_at timestamp
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.2 Implement phone endpoints (`functions/api/phone/`)
    - Implement `POST /api/phone/provision`: provision Twilio number via fetch, assign to user, configure webhooks, import into ElevenLabs (paid plans only)
    - Implement `POST /api/phone/configure`: update Twilio webhook/voicemail settings
    - Implement shared pool assignment for Free_Tier users
    - Handle Twilio API errors gracefully without charging user
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Voice and billing endpoints
  - [x] 7.1 Implement voice endpoints (`functions/api/voice/`)
    - Implement `GET /api/voice/library`: return 20 curated ElevenLabs voices with metadata
    - Implement `GET /api/voice/preview`: return preview audio URL for a voice
    - Implement `POST /api/voice/select`: update user's voice_id in users table
    - Implement `POST /api/voice/clone`: clone custom voice via ElevenLabs API (Pro_Plan only, 403 for others)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 7.2 Implement billing endpoints (`functions/api/billing/`)
    - Implement `POST /api/billing/checkout`: create Stripe Checkout session via raw fetch with form-encoded body
    - Implement `POST /api/billing/portal`: create Stripe Customer Portal session via raw fetch
    - Implement `GET /api/billing/usage`: return daily credit usage for current billing period using usage aggregation lib
    - _Requirements: 6.1, 6.5, 6.6, 6.7_

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Webhook handlers and OpenCawl API
  - [x] 9.1 Implement Stripe webhook handler (`functions/api/webhooks/stripe.js`)
    - Verify Stripe webhook signature using `crypto.subtle` HMAC-SHA256
    - Handle `checkout.session.completed`: update user plan, add credits
    - Handle `customer.subscription.updated`: update user plan status
    - Handle `customer.subscription.deleted`: downgrade to Free_Tier
    - Implement idempotency check via Stripe event ID lookup
    - Return 200 to Stripe even on internal errors to prevent retry storms
    - _Requirements: 6.2, 6.3, 6.4, 15.1_

  - [x] 9.2 Implement Twilio voice webhook handler (`functions/api/webhooks/twilio/voice.js`)
    - Validate Twilio request signature
    - Look up user by Twilio phone number
    - Route inbound call to user's ElevenLabs Conversational AI agent
    - Create call record with inbound direction
    - _Requirements: 9.1, 15.2_

  - [x] 9.3 Implement ElevenLabs webhook handlers (`functions/api/webhooks/elevenlabs/`)
    - Implement post-call handler: log transcript, update call record status/duration, trigger credit deduction (12 credits/min)
    - Implement tools handler: dispatch task to the task gateway, return task result to ElevenLabs agent
    - Verify shared secret on all ElevenLabs webhooks
    - _Requirements: 8.3, 9.2, 9.3, 15.3, 15.4_

  - [x] 9.4 Implement OpenCawl API endpoints (`functions/api/opencawl/`)
    - Implement `POST /api/opencawl/call`: validate API key, check credits, create call record, invoke ElevenLabs outbound call via `/v1/convai/twilio/outbound-call`
    - Implement `GET /api/opencawl/status`: return call status, duration, transcript
    - Implement `GET /api/opencawl/credits`: return current credit balance
    - Reject with 402 if insufficient credits before creating call record
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 9.5 Implement admin endpoints (`functions/api/admin/`)
    - Implement `GET /api/admin/stats`: return total users, active calls, total credits consumed, revenue metrics
    - Implement `GET /api/admin/users`: return paginated user list with phone, plan, credits_balance, created_at
    - Implement `GET /api/admin/waitlist`: return waitlist entries with status
    - Implement `POST /api/admin/waitlist/approve`: update waitlist status to approved
    - Implement `POST /api/admin/waitlist/reject`: update waitlist status to rejected
    - _Requirements: 2.4, 13.1, 13.2, 13.3_

- [x] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Landing page and login page
  - [x] 11.1 Build landing page (`src/landing/`)
    - Create `index.html` with hero section, features section, pricing section (Free/Starter/Pro), and waitlist join form
    - Create `styles.css` with a clean modern design
    - Create `script.js` with waitlist form submission to `/api/waitlist/join`, client-side phone validation, and success/error display
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 11.2 Build login page (`src/login/`)
    - Create `index.html` with phone number input and OTP verification form
    - Implement two-step flow: enter phone → enter code
    - Call `/api/auth/send-code` and `/api/auth/verify-code` endpoints
    - Redirect to dashboard on successful login
    - _Requirements: 1.1, 1.2_

- [x] 12. Dashboard SPA
  - [x] 12.1 Set up Dashboard shell and routing (`src/dashboard/`)
    - Create `index.html` entry point
    - Create `app.jsx` root component with `preact-router` routes for Home, Voice, Keys, Phone, Billing, Settings, Admin
    - Create `Layout.jsx` shell component with navigation sidebar
    - Implement `useAuth.js` hook for auth state via `/api/auth/me`
    - Implement `useApi.js` hook as fetch wrapper with error handling
    - Implement `useTheme.js` hook for dark/light theme toggle via CSS custom properties
    - Create `theme.css` with CSS custom properties for theming
    - Implement site-gate redirect for unapproved users
    - _Requirements: 11.1, 11.8, 2.3_

  - [x] 12.2 Build shared Dashboard components
    - Create `Toast.jsx` notification component for success/error states
    - Create `Modal.jsx` confirmation dialog for destructive actions
    - Create `CreditCard.jsx` credit balance display component
    - Create `CallLog.jsx` call history table component
    - _Requirements: 11.9, 11.10_

  - [x] 12.3 Build Dashboard pages
    - Create `Home.jsx`: call log table, credit balance card, quick action buttons
    - Create `Voice.jsx`: voice card grid with preview playback and select button
    - Create `Keys.jsx`: API key list with prefix/date/revoke, generate new key button with modal confirmation for revoke
    - Create `Phone.jsx`: provisioned number display + config options, or provision button
    - Create `Billing.jsx`: plan cards with upgrade CTAs, usage chart, Stripe portal link
    - Create `Settings.jsx`: account details and logout button
    - Create `Admin.jsx`: stats cards, user table, waitlist table with approve/reject (conditional on is_admin)
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 13.1, 13.2, 13.3_

  - [x] 12.4 Implement responsive mobile-first layout
    - Apply mobile-first CSS with responsive breakpoints
    - Ensure sidebar collapses to hamburger menu on mobile
    - Test all pages render correctly at mobile, tablet, and desktop widths
    - _Requirements: 11.11_

- [x] 13. OpenCawl skill file and final wiring
  - [x] 13.1 Create OpenCawl skill file (`public/opencawl.js`)
    - Export `make_call(to, message)`: POST to `/api/opencawl/call` with Bearer token
    - Export `check_call_status(call_id)`: GET `/api/opencawl/status` with Bearer token
    - Export `get_credits()`: GET `/api/opencawl/credits` with Bearer token
    - Include configuration for API base URL and API key
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 13.2 Wire `_redirects` and verify Vite build
    - Ensure `_redirects` routes `/dashboard/*` to Dashboard SPA
    - Verify Vite builds all three entry points (landing, login, dashboard) without errors
    - Verify no Node.js-specific imports exist in any Pages Function file
    - _Requirements: 17.5, 17.7_

- [x] 14. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 10 correctness properties defined in the design document using fast-check + Vitest
- Unit tests validate specific examples and edge cases
- All backend code uses only Web APIs (crypto.subtle, fetch, Response, Request) — no Node.js dependencies
- All Stripe, Twilio, and ElevenLabs interactions use raw fetch() calls
