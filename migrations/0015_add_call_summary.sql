-- Add summary column to calls for post-call summaries.
-- The summary is generated from the transcript and served when the user's agent polls.
ALTER TABLE calls ADD COLUMN summary TEXT;
