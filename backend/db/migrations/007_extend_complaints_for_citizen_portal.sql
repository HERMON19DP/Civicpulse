
BEGIN;

-- Human-readable complaint reference.
CREATE SEQUENCE IF NOT EXISTS complaint_reference_seq
  START WITH 1
  INCREMENT BY 1;

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS title VARCHAR(200),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(32);

-- Backfill existing complaints with usable values.
UPDATE complaints
SET title = LEFT(
      COALESCE(NULLIF(BTRIM(description), ''), 'Civic complaint'),
      200
    )
WHERE title IS NULL;

UPDATE complaints
SET reference_id =
  'CP-' ||
  TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY') ||
  '-' ||
  LPAD(nextval('complaint_reference_seq')::TEXT, 6, '0')
WHERE reference_id IS NULL;

ALTER TABLE complaints
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN reference_id SET NOT NULL;

ALTER TABLE complaints
  ADD CONSTRAINT complaints_reference_id_key UNIQUE (reference_id);

CREATE INDEX IF NOT EXISTS idx_complaints_reference_id
  ON complaints(reference_id);

COMMIT;
