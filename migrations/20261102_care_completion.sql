-- Record the occurrence being completed without changing the original history.
-- A unique source prevents duplicate completions, including concurrent requests.
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS source_record_id uuid REFERENCES care_records(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS care_records_completion_source ON care_records(source_record_id);
