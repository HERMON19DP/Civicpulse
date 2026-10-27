const pool = require("../../../config/database");

async function findNearbyComplaints({
  latitude,
  longitude,
  radiusMeters,
  maxResults,
  category,
}) {
  const values = [latitude, longitude, radiusMeters];

  let categoryCondition = "";

  if (category) {
    values.push(category.trim().toUpperCase());
    const categoryParam = `$${values.length}`;

    categoryCondition = `
      AND (
        CASE
          WHEN UPPER(TRIM(c.category)) IN ('ROAD', 'ROADS')
            THEN 'ROAD'
          ELSE UPPER(TRIM(c.category))
        END
      ) = (
        CASE
          WHEN ${categoryParam} IN ('ROAD', 'ROADS')
            THEN 'ROAD'
          ELSE ${categoryParam}
        END
      )
    `;
  }

  values.push(maxResults);
  const limitParam = `$${values.length}`;

  const result = await pool.query(
    `
      WITH search_point AS (
        SELECT ST_SetSRID(
          ST_MakePoint($2, $1),
          4326
        )::geography AS location
      )
      SELECT
        c.id,
        c.reference_id,
        c.title,
        c.description,
        c.category,
        c.status,
        c.priority,
        c.latitude,
        c.longitude,
        c.address,
        c.created_at,
        CASE
          WHEN UPPER(TRIM(c.category)) IN ('ROAD', 'ROADS')
            THEN 'ROAD'
          ELSE UPPER(TRIM(c.category))
        END AS canonical_category,
        ROUND(
          ST_Distance(c.location, sp.location)::numeric,
          2
        ) AS distance_meters
      FROM complaints c
      CROSS JOIN search_point sp
      WHERE c.location IS NOT NULL
        AND ST_DWithin(
          c.location,
          sp.location,
          $3
        )
        ${categoryCondition}
      ORDER BY
        ST_Distance(c.location, sp.location) ASC,
        c.created_at DESC
      LIMIT ${limitParam}
    `,
    values,
  );

  return result.rows;
}

module.exports = {
  findNearbyComplaints,
};
