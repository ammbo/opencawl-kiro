-- Shared phone number pool for free-tier users.
-- Admin adds numbers here; the system assigns them to free users on provision.
CREATE TABLE IF NOT EXISTS shared_phone_numbers (
  phone_number TEXT PRIMARY KEY,
  assigned_user_id TEXT,
  assigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id)
);

CREATE INDEX idx_shared_phones_available ON shared_phone_numbers(assigned_user_id)
  WHERE assigned_user_id IS NULL;
