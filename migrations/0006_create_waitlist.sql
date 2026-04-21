-- Migration: Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_waitlist_status ON waitlist(status);
