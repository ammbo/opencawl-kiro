# OpenCawl UX Review

## Verdict

The app is close to a strong hackathon demo, but not yet a winning product in its current state. The surface is polished, the architecture is real, `npm test` passes all 438 tests, and `npm run build` succeeds. But the core promise, "give your OpenClaw a phone number," is only partially true today: the developer/API path is much closer to working than the end-user dashboard path, and several marketed features are still narrative rather than implemented product.

## A-Z UX

A first-time user lands on a strong marketing page: the value prop is immediate, the hero is clear, and the two core stories are easy to grasp, inbound voice instructions and outbound AI phone calls. The page then pushes them to a waitlist, even though it also exposes direct login. That creates an immediate ambiguity: is this live software or prerelease access?

If they log in, the OTP flow is good. It's cleaner than most hackathon auth: country picker, phone formatting, six-box code entry, auto-submit, and straightforward error handling. From there they enter onboarding, which is logically sequenced:

1. confirm your verified number
2. provision a phone number
3. connect OpenClaw with an API key and skill file
4. make a test call

That's the right mental model. It feels like "identity, phone line, integration, proof."

After onboarding, the dashboard is intuitive enough. The sidebar labels are sensible: Home, Voice, API Keys, Phone, Make a Call, Inbound, Billing, Install, Settings. The Phone and Inbound pages are especially understandable. The inbound routing model is actually pretty solid in the backend: owner calls, shared-number strangers, dedicated-number accepted callers, and dedicated-number rejects are all handled explicitly in [functions/api/webhooks/twilio/voice.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/webhooks/twilio/voice.js:89).

The best real flow in the app is the developer integration path. The skill file in [public/opencawl.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/public/opencawl.js:22) uses Bearer auth correctly, so "connect your agent and call the API" is much closer to working as advertised than "click the dashboard and use it like a SaaS."

## What Works Vs. What Breaks

What works:

- OTP auth and session-based dashboard access are implemented cleanly.
- Phone provisioning exists for free shared numbers and paid dedicated numbers.
- Voice browsing/selection, API key generation, billing scaffolding, and call logging are all present.
- Inbound phone routing logic is thoughtful and more production-minded than typical hackathon glue code.
- The codebase is tested well for units and route behavior.

What does not work as advertised:

- The flagship dashboard outbound-call flow appears broken. The UI posts to `/api/openclaw/call` with only the session cookie in [Call.jsx](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/dashboard/pages/Call.jsx:75) and [Onboarding.jsx](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/dashboard/pages/Onboarding.jsx:330), but middleware requires Bearer auth for all `/api/openclaw/*` routes in [functions/_middleware.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/_middleware.js:51). Status polling has the same problem in [useCallStatus.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/dashboard/hooks/useCallStatus.js:13). That means the most demoable feature likely fails from the dashboard.
- The landing page promises inbound instruction dispatch and "you get a text when it's done" in [src/landing/index.html](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/landing/index.html:47), but I found no implemented OpenClaw task-dispatch flow. The ElevenLabs tools webhook is explicitly a stub in [functions/api/webhooks/elevenlabs/tools.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/webhooks/elevenlabs/tools.js:1), and the post-call webhook only records transcript and billing in [post-call.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/webhooks/elevenlabs/post-call.js:57).
- The waitlist is mostly cosmetic right now. Auth sends and verifies OTP without checking approval in [send-code.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/auth/send-code.js:7) and [verify-code.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/auth/verify-code.js:70). There is a gate helper in [site-gate.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/lib/site-gate.js:8), but it is not wired into sign-in.
- Pricing and feature claims are inconsistent. The landing page says Free gets 20 voices and Pro gets cloning in [src/landing/index.html](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/landing/index.html:185), while the billing page says Free gets 5 voices and Starter also gets cloning in [Billing.jsx](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/dashboard/pages/Billing.jsx:7). The backend then gates cloning to Pro only in [voice/clone.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/voice/clone.js:16).
- Paid-plan call entitlement is conceptually off. The pricing engine says paid users are minute-based in [credits.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/lib/credits.js:4), but outbound call creation still blocks on `credits_balance >= 12` for everyone in [openclaw/call.js](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/functions/api/openclaw/call.js:68).
- On onboarding, if a user already has an API key, the UI shows only the key prefix plus ellipsis and lets them copy it as if it were the real key in [Onboarding.jsx](/Users/ammonbrown/Documents/CursorProjects/other/opencawl-kiro/src/dashboard/pages/Onboarding.jsx:178). That is not a usable credential.

## Is It Intuitive?

Mostly yes at the UI layer. The product story is understandable, the dashboard IA is decent, and onboarding is the right shape. The problem is trust. A user can understand what to do, but the app currently overpromises relative to what the working paths actually are. Judges notice that quickly.

## Will It Win You A Hackathono?

Not as-is.

It can still demo well if you frame it narrowly as:

- phone-number provisioning for AI agents
- inbound routing rules
- API-key-driven outbound calling infrastructure
- billing/usage scaffolding around that

It will struggle if you pitch the broader story currently written on the landing page, because judges will ask to see:

- a dashboard call happen live
- an inbound call dispatch to OpenClaw
- the promised SMS completion loop
- consistent pricing/plan behavior

The shortest path to "could win" is:

1. fix the dashboard auth mismatch for `/api/openclaw/*`
2. either implement inbound task dispatch/SMS or remove those claims from the pitch
3. align pricing, plan gates, and cloning claims everywhere
4. make the onboarding integration step foolproof, especially API key handling

If you want, I can turn this into a tighter demo-readiness checklist and patch the most dangerous issue first, which is the broken dashboard call path.
