-- Create accepted numbers table for dedicated-number inbound call gating.
CREATE TABLE IF NOT EXISTS accepted_numbers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  phone_number TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, phone_number)
);

CREATE INDEX idx_accepted_numbers_user_id ON accepted_numbers(user_id);
CREATE INDEX idx_accepted_numbers_lookup ON accepted_numbers(user_id, phone_number);
