-- Migration: Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  credits_balance INTEGER NOT NULL DEFAULT 250,
  voice_id TEXT,
  twilio_phone_number TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
