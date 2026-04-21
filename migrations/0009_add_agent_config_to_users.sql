-- Add default agent configuration columns to users table.
ALTER TABLE users ADD COLUMN system_prompt TEXT;
ALTER TABLE users ADD COLUMN first_message TEXT;
