-- Add openclaw_result column to calls for storing agent action outcomes.
-- The Openclaw agent posts results back via POST /api/openclaw/results.
-- Max length of 10,000 characters is enforced at the API layer.
ALTER TABLE calls ADD COLUMN openclaw_result TEXT;
