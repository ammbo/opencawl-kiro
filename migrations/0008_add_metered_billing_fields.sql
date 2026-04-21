-- Add fields for metered billing and voice name caching.
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN period_minutes_used REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN current_period_start TEXT;
ALTER TABLE users ADD COLUMN voice_name TEXT;
