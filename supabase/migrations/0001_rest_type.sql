-- Adds Active/Complete rest day type support.
-- Referenced by: js/history.js (logRestDay, toggleRestDayType), js/state.js

ALTER TABLE rest_days ADD COLUMN IF NOT EXISTS rest_type text DEFAULT 'complete';
