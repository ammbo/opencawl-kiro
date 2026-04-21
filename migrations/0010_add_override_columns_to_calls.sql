-- Add per-call agent override columns to calls table.
ALTER TABLE calls ADD COLUMN override_system_prompt TEXT;
ALTER TABLE calls ADD COLUMN override_voice_id TEXT;
ALTER TABLE calls ADD COLUMN override_first_message TEXT;
