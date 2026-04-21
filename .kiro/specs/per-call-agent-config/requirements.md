# Requirements Document

## Introduction

Evolve the OpenCawl phone platform to support per-call agent configuration for outbound calls, smart inbound call routing based on caller identity and number type, and retain polling-based call status tracking. Currently the platform uses a single global ElevenLabs agent ID for all calls and routes all inbound calls identically. This feature introduces the ability to override the agent's system prompt, voice, and first message on each outbound call, and to route inbound calls differently depending on whether the caller is the number owner, an unknown caller on a shared number, or an unknown caller on a dedicated number. Mid-call tool actions are explicitly out of scope and acknowledged as a future iteration.

## Glossary

- **Outbound_Call_Endpoint**: The POST /api/opencawl/call API that initiates outbound calls via ElevenLabs and Twilio
- **Agent_Override**: A set of per-call ElevenLabs agent configuration fields (system_prompt, voice_id, first_message) passed at call initiation time via the ElevenLabs `agent_overrides` API parameter
- **Inbound_Router**: The POST /api/webhooks/twilio/voice webhook handler that receives inbound Twilio calls and decides how to route them
- **Owner_Call**: An inbound call where the caller's phone number matches the registered phone number of the user who owns the called Twilio number
- **Shared_Number**: A Twilio phone number from the shared pool assigned to free-tier users, potentially shared across multiple users
- **Dedicated_Number**: A Twilio phone number exclusively provisioned for a paid-tier user
- **Unknown_Caller**: An inbound caller whose phone number does not match the owner's registered phone number
- **Accepted_Numbers_List**: A user-configurable list of phone numbers that a dedicated-number user permits to reach their agent on inbound calls
- **Promo_Message**: A TwiML Say response played to unknown callers on shared numbers that informs them about OpenCawl
- **Call_Status_Endpoint**: The GET /api/opencawl/status API that returns call status, duration, and transcript by polling
- **Call_Log**: The calls table in D1 containing records of all inbound and outbound calls for a user
- **Agent_Config**: A stored per-user default agent configuration (system_prompt, voice_id, first_message) that can be used when the owner calls their own number

## Requirements

### Requirement 1: Per-Call Agent Override on Outbound Calls

**User Story:** As an API consumer, I want to pass a system prompt, voice ID, and first message when initiating an outbound call, so that each call can have a distinct agent personality.

#### Acceptance Criteria

1. WHEN the Outbound_Call_Endpoint receives a request with a `system_prompt` field, THE Outbound_Call_Endpoint SHALL include the system_prompt in the ElevenLabs `agent_overrides.agent.prompt.prompt` payload
2. WHEN the Outbound_Call_Endpoint receives a request with a `voice_id` field, THE Outbound_Call_Endpoint SHALL include the voice_id in the ElevenLabs `agent_overrides.tts.voice_id` payload
3. WHEN the Outbound_Call_Endpoint receives a request with a `first_message` field, THE Outbound_Call_Endpoint SHALL include the first_message in the ElevenLabs `agent_overrides.agent.first_message` payload
4. WHEN the Outbound_Call_Endpoint receives a request without `system_prompt`, `voice_id`, or `first_message` fields, THE Outbound_Call_Endpoint SHALL use the existing default behavior (global agent ID, user's stored voice_id if present, message as dynamic variable)
5. WHEN the Outbound_Call_Endpoint receives a `system_prompt` that exceeds 10,000 characters, THE Outbound_Call_Endpoint SHALL return a 400 error with code INVALID_INPUT
6. WHEN the Outbound_Call_Endpoint receives a `first_message` that exceeds 2,000 characters, THE Outbound_Call_Endpoint SHALL return a 400 error with code INVALID_INPUT
7. THE Outbound_Call_Endpoint SHALL continue to require `destination_phone` as a mandatory field
8. THE Outbound_Call_Endpoint SHALL make the `message` field optional when `system_prompt` and `first_message` are provided

### Requirement 2: Inbound Call Owner Detection

**User Story:** As a user, I want to call my own assigned number to initiate an agent session configured with my personal settings, so that I can use my agent hands-free from any phone.

#### Acceptance Criteria

1. WHEN an inbound call arrives and the caller's phone number matches the registered phone number of the user who owns the called Twilio number, THE Inbound_Router SHALL classify the call as an Owner_Call
2. WHEN an Owner_Call is detected, THE Inbound_Router SHALL initialize the ElevenLabs agent session using the owner's stored Agent_Config (system_prompt, voice_id, first_message) from the users table
3. WHEN an Owner_Call is detected and the owner has no stored Agent_Config, THE Inbound_Router SHALL fall back to the global ElevenLabs agent ID with the owner's stored voice_id if available
4. THE Inbound_Router SHALL create a call record in the Call_Log with direction "inbound" and the caller's phone number for Owner_Calls

### Requirement 3: Inbound Routing for Unknown Callers on Shared Numbers

**User Story:** As a platform operator, I want unknown callers on shared numbers to hear a promotional message, so that free-tier users' shared numbers do not accept arbitrary inbound calls.

#### Acceptance Criteria

1. WHEN an Unknown_Caller calls a Shared_Number, THE Inbound_Router SHALL respond with a TwiML Say element containing the Promo_Message
2. THE Promo_Message SHALL inform the caller that this number is powered by OpenCawl and direct them to OpenCawl.ai
3. WHEN an Unknown_Caller calls a Shared_Number, THE Inbound_Router SHALL hang up after playing the Promo_Message without connecting to an ElevenLabs agent
4. THE Inbound_Router SHALL identify a number as a Shared_Number by checking the shared_phone_numbers table for the called number

### Requirement 4: Inbound Routing for Unknown Callers on Dedicated Numbers

**User Story:** As a paid user, I want to control which unknown callers can reach my agent on my dedicated number, so that I can manage who interacts with my AI agent.

#### Acceptance Criteria

1. WHEN an Unknown_Caller calls a Dedicated_Number and the caller's number is in the owner's Accepted_Numbers_List, THE Inbound_Router SHALL accept the call and connect to the owner's ElevenLabs agent
2. WHEN an Unknown_Caller calls a Dedicated_Number and the caller's number is not in the Accepted_Numbers_List and the list is non-empty, THE Inbound_Router SHALL respond with a TwiML Say message indicating the number is not accepting calls and hang up
3. WHEN an Unknown_Caller calls a Dedicated_Number and the owner has an empty Accepted_Numbers_List, THE Inbound_Router SHALL accept the call and connect to the owner's ElevenLabs agent (open-access mode)
4. WHEN an accepted Unknown_Caller is connected on a Dedicated_Number, THE Inbound_Router SHALL query the Call_Log for previous calls from that caller's number to the same user and pass the call history context as a dynamic variable to the ElevenLabs agent
5. THE Inbound_Router SHALL create a call record in the Call_Log with direction "inbound" for all accepted inbound calls on Dedicated_Numbers

### Requirement 5: Accepted Numbers List Management

**User Story:** As a paid user, I want to manage a list of phone numbers allowed to call my dedicated number, so that I can control inbound access to my agent.

#### Acceptance Criteria

1. THE Accepted_Numbers_List management endpoint (POST /api/phone/accepted-numbers) SHALL allow adding one or more E.164 phone numbers with optional labels
2. THE Accepted_Numbers_List management endpoint (DELETE /api/phone/accepted-numbers) SHALL allow removing phone numbers from the list
3. THE Accepted_Numbers_List management endpoint (GET /api/phone/accepted-numbers) SHALL return all numbers in the user's list with their labels and creation timestamps
4. WHEN a user attempts to add a phone number that is not valid E.164 format, THE Accepted_Numbers_List management endpoint SHALL return a 400 error with code INVALID_INPUT
5. IF a free-tier user attempts to manage the Accepted_Numbers_List, THEN THE Accepted_Numbers_List management endpoint SHALL return a 403 error with code FORBIDDEN and a message indicating this feature requires a paid plan

### Requirement 6: User Agent Configuration Storage

**User Story:** As a user, I want to save a default agent configuration (system prompt, voice, first message) to my profile, so that my inbound owner calls and outbound calls can use my preferred agent personality.

#### Acceptance Criteria

1. THE Agent_Config endpoint (POST /api/phone/agent-config) SHALL accept and store system_prompt, voice_id, and first_message fields for the authenticated user
2. THE Agent_Config endpoint (GET /api/phone/agent-config) SHALL return the user's stored system_prompt, voice_id, and first_message
3. WHEN the Agent_Config endpoint receives a system_prompt exceeding 10,000 characters, THE Agent_Config endpoint SHALL return a 400 error with code INVALID_INPUT
4. WHEN the Agent_Config endpoint receives a first_message exceeding 2,000 characters, THE Agent_Config endpoint SHALL return a 400 error with code INVALID_INPUT
5. THE Agent_Config endpoint SHALL allow partial updates where only provided fields are overwritten and omitted fields retain their existing values

### Requirement 7: Call Status Polling Retention

**User Story:** As an API consumer, I want to poll for call status via GET /api/opencawl/status, so that I can track call completion without requiring a publicly accessible webhook URL.

#### Acceptance Criteria

1. THE Call_Status_Endpoint SHALL continue to return call_id, status, duration_seconds, and transcript for a given call_id
2. THE Call_Status_Endpoint SHALL return the agent_override fields (system_prompt, voice_id, first_message) that were used for the call when they were provided at initiation
3. WHEN a call is still in progress, THE Call_Status_Endpoint SHALL return status "in_progress" with null duration_seconds and null transcript
4. THE Call_Status_Endpoint SHALL require the call to belong to the authenticated user before returning data

### Requirement 8: Out-of-Scope Acknowledgment for Mid-Call Tools

**User Story:** As a developer, I want the tools webhook stub to remain in place, so that future mid-call tool actions can be implemented without restructuring.

#### Acceptance Criteria

1. THE tools webhook endpoint (POST /api/webhooks/elevenlabs/tools) SHALL continue to return a 501 Not Implemented response
2. THE tools webhook endpoint SHALL retain its current stub implementation and documentation comments describing the planned future functionality
