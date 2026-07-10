-- Adds Workout Reminders settings (usual training days + enabled flag).
-- Referenced by: js/state.js (settings fetch), js/data.js (saveReminderSettings)

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS training_days text DEFAULT '';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reminders_enabled text DEFAULT '0';
