-- Additive migration: existing actions, records, sessions and plans are preserved.
ALTER TABLE care_types ADD COLUMN IF NOT EXISTS default_dose text NOT NULL DEFAULT '';
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS reminder_offsets integer[];
ALTER TABLE planned_events ADD COLUMN IF NOT EXISTS dose text NOT NULL DEFAULT '';
-- NULL retains the original type default for existing plans; 0 means no recurrence.
ALTER TABLE planned_events ADD COLUMN IF NOT EXISTS interval_days integer CHECK (interval_days BETWEEN 0 AND 3650);
ALTER TABLE planned_events ADD COLUMN IF NOT EXISTS reminder_offsets integer[];
