-- Migration: Add task dispatch fields to calls table
-- Adds goal column for natural language task descriptions and
-- source column to distinguish call origin (api, voice_dispatch, sms_dispatch)

ALTER TABLE calls ADD COLUMN goal TEXT;
ALTER TABLE calls ADD COLUMN source TEXT NOT NULL DEFAULT 'api';
