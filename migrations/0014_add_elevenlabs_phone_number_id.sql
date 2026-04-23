-- Store the ElevenLabs phone number resource ID for provisioned numbers.
-- The outbound call API requires this ID, not the raw E.164 number.
ALTER TABLE users ADD COLUMN elevenlabs_phone_number_id TEXT;
