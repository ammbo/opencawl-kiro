-- Add onboarding_completed flag to track whether a user has finished the onboarding flow.
ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
