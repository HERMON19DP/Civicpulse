const pool = require("../../../config/database");

async function findClusters({
  latitude,
  longitude,
  radiusMeters,
  clusterDistanceMeters,
  category,
}) {
  const query = `
    WITH RECURSIVE search_center AS (
      SELECT ST_SetSRID(
        ST_MakePoint($2, $1),
        4326
      )::geography AS location
    ),
    filtered_complaints AS (
      SELECT
        c.id,
        c.reference_id,
        c.title,
        c.description,
        c.category,
        CASE
          WHEN UPPER(TRIM(c.category)) IN ('ROAD', 'ROADS')
            THEN 'ROAD'
          ELSE UPPER(TRIM(c.category))
        END AS canonical_category,
        c.status,
        c.priority,
        c.address,
        c.latitude,
        c.longitude,
        c.created_at,
        c.location
      FROM complaints c
      CROSS JOIN search_center sc
      WHERE c.location IS NOT NULL
        AND ST_DWithin(
          c.location,
          sc.location,
          $3
        )
        AND (
          $4::text IS NULL
          OR CASE
            WHEN UPPER(TRIM(c.category)) IN ('ROAD', 'ROADS')
              THEN 'ROAD'
            ELSE UPPER(TRIM(c.category))
          END = CASE
            WHEN UPPER(TRIM($4::text)) IN ('ROAD', 'ROADS')
              THEN 'ROAD'
            ELSE UPPER(TRIM($4::text))
          END
        )
    ),
    edges AS (
      SELECT
        a.id AS source_id,
        b.id AS target_id
      FROM filtered_complaints a
      JOIN filtered_complaints b
        ON a.id <> b.id
       AND ST_DWithin(
         a.location,
         b.location,
         $5
       )
    ),
    reachability AS (
      SELECT id AS root_id, id AS complaint_id
      FROM filtered_complaints

      UNION

      SELECT r.root_id, e.target_id
      FROM reachability r
      JOIN edges e
        ON e.source_id = r.complaint_id
    ),
    component_membership AS (
      SELECT
        complaint_id,
        MIN(root_id::text)::uuid AS cluster_id
      FROM reachability
      GROUP BY complaint_id
    )
    SELECT
      fc.id,
      fc.reference_id,
      fc.title,
      fc.description,
      fc.category,
      fc.canonical_category,
      fc.status,
      fc.priority,
      fc.address,
      fc.latitude,
      fc.longitude,
      fc.created_at,
      cm.cluster_id,
      ROUND(
        ST_Distance(fc.location, sc.location)::numeric,
        2
      ) AS distance_meters
    FROM filtered_complaints fc
    JOIN component_membership cm
      ON cm.complaint_id = fc.id
    CROSS JOIN search_center sc
    ORDER BY cm.cluster_id, fc.created_at DESC;
  `;

  const values = [
    latitude,
    longitude,
    radiusMeters,
    category ?? null,
    clusterDistanceMeters,
  ];

  const result = await pool.query(query, values);

  return result.rows;
}

module.exports = {
  findClusters,
};
