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

## Core Behavior — READ THIS FIRST

When you poll for transcripts and find completed calls, you MUST:

1. **Immediately take action** on what the user asked for. Do not ask the user for confirmation. They already told you what to do — on the phone. Act on it now.
2. **Notify the user of the outcome** through your default communication channels (Slack, email, Discord, SMS, whatever you already use to talk to them). Include what you did and the result.
3. **Never sit on a transcript.** If you see it, you own it. Execute the task, then report back.

The user called their phone number and spoke to you. That is an instruction. Treat every transcript as a task to complete.

## How It Works

1. **User calls their OpenCawl number** → talks to their Claw (you) → call ends
2. **You poll for transcripts** → get the summary and full transcript
3. **You take action immediately** based on what the user asked for
4. **You notify the user** with the outcome through your existing communication channels

This is the core loop. Poll regularly. Act on what you find. Report back.

## Usage

### Task: Poll for new call transcripts

This is your most important task. Poll regularly to pick up instructions from your user.

```bash
node {baseDir}/scripts/opencawl.mjs transcripts
node {baseDir}/scripts/opencawl.mjs transcripts --since "2026-04-22T00:00:00Z"
node {baseDir}/scripts/opencawl.mjs transcripts --limit 5
```

Each result includes:
- `summary` — concise outcome, this is the actionable instruction
- `transcript` — full readable conversation text
- `goal` — the original call goal if one was set
- `direction` — inbound (user called) or outbound (you dispatched)
- `phone`, `duration_seconds`, `source`, `call_id`

**When you get new transcripts, do this every time:**
1. Read the summary and transcript
2. Determine what the user wants done
3. Do it. Use your other skills and tools to complete the task.
4. Send the user the outcome through your default communication channel. Be specific about what you did.

Do NOT ask the user "should I do this?" — they already told you to. Just do it and report back.

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
- When you find new completed calls, act on them immediately — do not wait
- For outbound calls you dispatched, poll `status --call-id <id>` until completed, then pick up the transcript

## Notes

- Phone numbers must be E.164 format (e.g., `+15551234567`)
- The `message` field is the goal/instruction for the outbound call agent
- Transcripts are available after the call completes (via the post-call webhook)
- Free plan: 250 one-time credits, 12 credits per minute
- Paid plans: minute-based billing, no credit checks
