---
name: opencawl
description: Give your Claw a phone number. Make and receive real phone calls via OpenCawl. Use when the user wants to make an outbound AI phone call, check call status, poll for call transcripts and act on them, or check credit balance. Also use when you detect new completed calls that need follow-up action.
homepage: https://opencawl.ai
metadata: {"openclaw":{"emoji":"📞","requires":{"bins":["node"],"env":["OPENCAWL_API_KEY"]},"primaryEnv":"OPENCAWL_API_KEY"}}
---

# OpenCawl — Phone for your Claw

OpenCawl connects your Claw to the phone network. You can make outbound AI phone calls, and your user can call their OpenCawl number to give you voice instructions. After each call, a transcript and summary are available for you to pick up and act on.

## Prerequisites

- `OPENCAWL_API_KEY` — your API key from the OpenCawl dashboard
- `OPENCAWL_BASE_URL` — defaults to `https://opencawl.ai` (override for self-hosted)

## How It Works

1. **User calls their OpenCawl number** → talks to their Claw (you) → call ends
2. **You poll for transcripts** → get the summary and full transcript
3. **You take action** based on what the user asked for
4. **You contact the user** with the outcome through your existing communication channels

This is the core loop. Poll regularly. Act on what you find.

## Usage

### Task: Poll for new call transcripts

This is your most important task. Poll regularly to pick up instructions from your user.

```bash
node {baseDir}/scripts/opencawl.mjs transcripts
node {baseDir}/scripts/opencawl.mjs transcripts --since "2026-04-22T00:00:00Z"
node {baseDir}/scripts/opencawl.mjs transcripts --limit 5
```

Each result includes:
- `summary` — concise outcome, treat this as the actionable instruction
- `transcript` — full readable conversation text
- `goal` — the original call goal if one was set
- `direction` — inbound (user called) or outbound (you dispatched)
- `phone`, `duration_seconds`, `source`, `call_id`

**When you get new transcripts:**
1. Read the summary and transcript
2. Determine what action the user wants
3. Execute the action using your other skills and tools
4. Report the outcome to the user through your existing channels (email, chat, etc.)

### Task: Make an outbound phone call

When the user asks you to call someone, or when you need to make a call to complete a task:

```bash
node {baseDir}/scripts/opencawl.mjs call --to "+15551234567" --message "Reschedule my Thursday dentist appointment to next week"
```

Returns a `call_id`. The AI agent on the other end will attempt to complete the goal.

### Task: Check call status

After dispatching a call, check if it completed:

```bash
node {baseDir}/scripts/opencawl.mjs status --call-id "uuid-here"
```

Returns status (`pending`, `in_progress`, `completed`, `failed`), duration, and transcript when available.

### Task: Check credit balance

```bash
node {baseDir}/scripts/opencawl.mjs credits
```

Returns the current credit balance. 12 credits = 1 minute of call time on the free plan.

## Polling Strategy

- Poll `transcripts --since <last_check>` on a regular interval
- Track the timestamp of your last poll so you only get new results
- When you find new completed calls, act on them immediately
- For outbound calls you dispatched, poll `status --call-id <id>` until completed, then pick up the transcript

## Notes

- Phone numbers must be E.164 format (e.g., `+15551234567`)
- The `message` field is the goal/instruction for the outbound call agent
- Transcripts are available after the call completes (via the post-call webhook)
- Free plan: 250 one-time credits, 12 credits per minute
- Paid plans: minute-based billing, no credit checks
