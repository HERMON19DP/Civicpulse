
BEGIN;

-- Add a meter-aware geographic point for spatial queries.
ALTER TABLE complaints
ADD COLUMN location geography(Point, 4326);

-- Backfill existing complaints with valid coordinates.
UPDATE complaints
SET location = ST_SetSRID(
    ST_MakePoint(longitude, latitude),
    4326
)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

-- Accelerate nearby-complaint and spatial-filter queries.
CREATE INDEX idx_complaints_location_gist
ON complaints
USING GIST (location);

COMMIT;
