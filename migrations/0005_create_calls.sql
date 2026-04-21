-- Migration: Create calls table
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  direction TEXT NOT NULL,
  destination_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_seconds INTEGER,
  transcript TEXT,
  elevenlabs_conversation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_calls_status ON calls(status);
