# Design Document: Production Readiness

## Overview

This design addresses eight requirements to make OpenCawl production-ready: removing the waitlist system, fixing dashboard outbound call authentication, implementing goal-based outbound calling via inbound dispatch, adding post-call SMS notifications, aligning pricing and plan gates, fixing paid-plan call entitlement, fixing the onboarding API key display, and polishing the landing page.

The changes span the Cloudflare Pages Functions backend, the Preact dashboard, the landing page, and the D1 database schema. The core architectural change is evolving the middleware to support dual authentication (session cookie + Bearer token) on `/api/openclaw/*` routes, and introducing a task dispatch system that lets users issue outbound call instructions via inbound voice calls or SMS.

## Architecture

### System Context

```mermaid
graph TB
    subgraph "Frontend"
        LP[Landing Page]
        DB[Dashboard - Preact]
    end

    subgraph "Backend - Cloudflare Pages Functions"
        MW[Middleware - Dual Auth]
        OC[/api/openclaw/* endpoints]
        WH[Webhook Handlers]
        LIB[Lib: credits, routing, overrides]
    end

    subgraph "External Services"
        EL[ElevenLabs ConvAI]
        TW[Twilio Voice + SMS]
        ST[Stripe Billing]
    end

    subgraph "Data"
        D1[(D1 Database)]
    end

    DB -->|session cookie| MW
    DB -->|Bearer token| MW
    MW --> OC
    OC --> EL
    OC --> D1
    WH --> D1
    EL -->|post-call webhook| WH
    EL -->|tools webhook| WH
    TW -->|voice webhook| WH
    TW -->|SMS webhook| WH
    WH --> TW
    WH --> EL
    OC --> TW
    LIB --> D1
    LIB --> ST
```

### Key Architectural Decisions

1. **Dual-auth middleware**: The `/api/openclaw/*` branch will attempt Bearer token auth first (existing behavior), then fall back to session cookie auth. This is a simple priority chain — no new auth mechanism needed.

2. **Task dispatch via ElevenLabs tools webhook**: When an owner calls their number and describes a task, the ElevenLabs agent uses a registered `dispatch_call` tool. ElevenLabs sends a tool-call webhook to `/api/webhooks/elevenlabs/tools`, which parses the goal and destination, creates a call record, and initiates the outbound call via the existing ElevenLabs outbound API.

3. **SMS inbound via new Twilio webhook**: A new `POST /api/webhooks/twilio/sms` endpoint receives SMS messages. If the sender is the owner of the number, it parses the message as a task instruction and dispatches accordingly.

4. **SMS notification via Twilio Messages API**: The post-call webhook generates a concise summary (≤160 chars) from the transcript and sends it via Twilio's REST API using the user's OpenCawl number as the sender.

5. **Plan-aware entitlement**: The `check()` function in `credits.js` gains a plan-aware variant `checkEntitlement()` that returns `{ allowed: true }` for paid users (overage is always billed via Stripe) and checks credit balance for free users.

6. **No new tables needed for task dispatch**: Task dispatch outbound calls are stored in the existing `calls` table with `direction: 'outbound'` and the goal stored in `override_system_prompt`. A new `goal` column is added to `calls` for explicit goal tracking, and a `source` column to distinguish dispatch origin (`api`, `voice_dispatch`, `sms_dispatch`).

## Components and Interfaces

### 1. Middleware (`functions/_middleware.js`)

**Changes:**
- Remove `/api/waitlist/join` from `PUBLIC_PATHS`
- Modify the `/api/openclaw/*` branch to attempt Bearer token auth first, then fall back to session cookie auth

**Dual-auth flow:**
```
if path starts with /api/openclaw/:
  if Authorization header has Bearer token:
    validate API key → attach user → next()
  else if session cookie present:
    verify JWT → load user from DB → attach user → next()
  else:
    return 401
```

### 2. Credits Engine (`functions/lib/credits.js`)

**New export: `checkEntitlement(db, user)`**

```javascript
/**
 * Plan-aware call entitlement check.
 * - Free users: checks credits_balance >= MINIMUM_CALL_CREDITS (12)
 * - Paid users: always allowed (overage billed via Stripe metered billing)
 * @returns {{ allowed: boolean, reason?: string }}
 */
export async function checkEntitlement(db, user) { ... }
```

The existing `check()` function remains unchanged for backward compatibility.

### 3. Outbound Call API (`functions/api/openclaw/call.js`)

**Changes:**
- Replace `check(db, user.id, MINIMUM_CALL_CREDITS)` with `checkEntitlement(db, user)`
- The user object now comes from either Bearer token or session cookie auth (transparent to this endpoint)

### 4. Tools Webhook (`functions/api/webhooks/elevenlabs/tools.js`)

**New implementation replacing the 501 stub:**

Handles ElevenLabs tool-call webhooks. The primary tool is `dispatch_call`:

```javascript
// Tool call payload from ElevenLabs:
{
  tool_call_id: "...",
  tool_name: "dispatch_call",
  parameters: {
    destination_phone: "+15551234567",
    goal: "Reschedule my Thursday appointment to next week"
  }
}
```

**Flow:**
1. Verify ElevenLabs signature (using `ELEVENLABS_WEBHOOK_SECRET_TOOLS`)
2. Extract `user_id` from conversation dynamic variables
3. Parse tool call parameters
4. Validate destination phone (E.164)
5. Create call record in DB with `source: 'voice_dispatch'`
6. Initiate ElevenLabs outbound call with goal as system prompt context
7. Return tool result to ElevenLabs (success/failure message)

### 5. SMS Inbound Webhook (`functions/api/webhooks/twilio/sms.js`)

**New endpoint: `POST /api/webhooks/twilio/sms`**

Handles inbound SMS messages from Twilio:

1. Verify Twilio signature
2. Look up the owner of the `To` number
3. If sender is the owner, parse the SMS body as a task instruction
4. Extract destination phone number from the message text (E.164 pattern match)
5. If no phone number found, reply with TwiML asking for clarification
6. If phone number found, create call record and initiate outbound call
7. Reply with TwiML confirming dispatch or error

**Phone number extraction:** Use regex `/\+\d{1,15}/` to find E.164 numbers in the message body. The remainder of the message (minus the phone number) becomes the goal.

### 6. Post-Call Webhook (`functions/api/webhooks/elevenlabs/post-call.js`)

**Changes — add SMS notification after billing:**

1. After updating the call record and billing, look up the user
2. If user has a phone number (`user.phone`), generate a summary
3. Summary format: `"OpenCawl: Called {destination}. {outcome}"` (≤160 chars)
4. Send via Twilio Messages API: `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`
5. If SMS fails, log and continue (non-blocking)

**Summary generation:** Extract the last agent message from the transcript as the outcome. Truncate to fit within 160 chars total.

### 7. Inbound Routing (`functions/lib/inbound-routing.js`)

**Changes for owner calls:**
- Owner calls now connect to an ElevenLabs agent configured with a task-dispatch system prompt
- The agent has a registered `dispatch_call` tool that triggers the tools webhook
- Pass `owner_mode: "dispatch"` as a dynamic variable so the agent knows to offer task dispatch

**New owner dispatch system prompt:**
```
You are the user's AI phone assistant. Listen to their instruction.
If they want you to make a call on their behalf, use the dispatch_call tool
with the destination phone number and the goal/task description.
Confirm the dispatch to the user before hanging up.
```

### 8. Voice Clone Gate (`functions/api/voice/clone.js`)

**Change:** Replace `user.plan !== 'pro'` with `user.plan === 'free'` so both `starter` and `pro` users can clone voices.

### 9. Onboarding Flow (`src/dashboard/pages/Onboarding.jsx`)

**Changes to Step 3 (Connect OpenClaw):**
- If existing keys found: show message "API key was previously generated and cannot be shown again"
- Do NOT display `key_prefix + '…'` as if it were copyable
- Add "Regenerate Key" button that calls `DELETE /api/keys/revoke` then `POST /api/keys/create`
- When a new key is generated (fresh or regenerated): display full key with copy button
- Add warning: "Save this key now — it won't be shown again"

### 10. Landing Page (`src/landing/index.html` + `src/landing/script.js`)

**Deletions:**
- Remove entire `#waitlist` section (form, heading, subtitle)
- Remove waitlist form submission logic from `script.js`

**Updates:**
- Hero CTA: `href="/src/login/"` with text "Get Started"
- Nav "Get Started" button: `href="/src/login/"`
- All pricing card buttons: `href="/src/login/"`
- Pricing cards: align with requirements (Free: 250 credits, shared number, 5 curated voices; Starter: 100 min/mo, dedicated number, full voice library + cloning; Pro: 350 min/mo, dedicated number, full voice library + cloning)
- Voice feature card: "5 curated voices" for free, mention cloning for paid
- FAQ "When will it be available?": "OpenCawl is live and available for sign-up"
- Footer copyright: current year
- Hero subtitle: accurate description of current capabilities
- Demo sections: accurate descriptions

### 11. File Deletions

- `functions/api/waitlist/join.js`
- `functions/api/admin/waitlist.js`
- `functions/api/admin/waitlist/approve.js`
- `functions/api/admin/waitlist/reject.js`
- `functions/lib/site-gate.js`

### 12. New Database Migration

**`migrations/0013_add_task_dispatch_fields.sql`:**
```sql
ALTER TABLE calls ADD COLUMN goal TEXT;
ALTER TABLE calls ADD COLUMN source TEXT NOT NULL DEFAULT 'api';
```

`source` values: `'api'` (dashboard/API), `'voice_dispatch'` (owner inbound call), `'sms_dispatch'` (owner SMS)

## Data Models

### Users Table (existing — no changes)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| phone | TEXT UNIQUE | E.164 |
| plan | TEXT | 'free', 'starter', 'pro' |
| credits_balance | INTEGER | Free tier pool |
| voice_id | TEXT | Selected voice |
| twilio_phone_number | TEXT | Dedicated number |
| period_minutes_used | REAL | Current billing period |
| stripe_subscription_id | TEXT | For metered billing |
| system_prompt | TEXT | Default agent prompt |
| first_message | TEXT | Default agent greeting |

### Calls Table (modified)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | References users |
| direction | TEXT | 'inbound', 'outbound' |
| destination_phone | TEXT | E.164 |
| status | TEXT | 'pending', 'in_progress', 'completed', 'failed' |
| duration_seconds | INTEGER | |
| transcript | TEXT | JSON |
| elevenlabs_conversation_id | TEXT | |
| override_system_prompt | TEXT | Per-call override |
| override_voice_id | TEXT | Per-call override |
| override_first_message | TEXT | Per-call override |
| **goal** | TEXT | **NEW** — Natural language task description |
| **source** | TEXT | **NEW** — 'api', 'voice_dispatch', 'sms_dispatch' |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

