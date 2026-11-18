const pool = require("../config/database");
const {
  CANONICAL_CATEGORY_SQL,
  canonicalCategoryParamSql,
} = require("../modules/intelligence/spatial/spatial.repository");

let hasHotspotsCityCache = null;
let hasAdminGeoColumnsCache = null;

async function supportsAdministrativeGeographyColumns(db = pool) {
  if (hasAdminGeoColumnsCache !== null) {
    return hasAdminGeoColumnsCache;
  }
  try {
    const res = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'complaints'
         AND column_name IN (
           'administrative_ward_id',
           'administrative_zone_id',
           'administrative_boundary_version_id'
         )`,
    );
    hasAdminGeoColumnsCache = Number(res.rows[0]?.cnt || 0) === 3;
    return hasAdminGeoColumnsCache;
  } catch {
    return false;
  }
}

async function hasHotspotsTables(db = pool) {
  try {
    const res = await db.query(
      `SELECT
         to_regclass('public.hotspots') IS NOT NULL AS hotspots_exists,
         to_regclass('public.hotspot_complaints') IS NOT NULL AS link_exists`,
    );
    return Boolean(
      res.rows[0]?.hotspots_exists && res.rows[0]?.link_exists,
    );
  } catch {
    return false;
  }
}

async function supportsHotspotsCityColumn(db = pool) {
  if (hasHotspotsCityCache === true) {
    return true;
  }
  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'hotspots'
           AND column_name = 'city'
       ) AS has_city`,
    );
    const exists = Boolean(res.rows[0]?.has_city);
    if (exists) {
      hasHotspotsCityCache = true;
    }
    return exists;
  } catch {
    return false;
  }
}

async function upsertHotspotWithMembers(hotspotData, memberComplaints = []) {
  const exists = await hasHotspotsTables();
  if (!exists) {
    return null;
  }

  const hasCityCol = await supportsHotspotsCityColumn();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const status = hotspotData.openCount === 0 ? "RESOLVED" : "ACTIVE";

    const upsertRes = await client.query(
      hasCityCol
        ? `INSERT INTO hotspots (
             hotspot_key,
             title,
             city,
             ward,
             zone,
             center_latitude,
             center_longitude,
             radius_meters,
             dominant_category,
             issue_categories,
             category_counts,
             complaint_count,
             open_count,
             density_per_sq_km,
             recurrence_score,
             confidence,
             severity,
             has_cross_category_overlap,
             overlap_categories,
             overlap_summary,
             time_window_days,
             first_reported_at,
             last_reported_at,
             status,
             metadata,
             detected_at,
             updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
             $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21,
             $22, $23, $24, $25::jsonb, NOW(), NOW()
           )
           ON CONFLICT (hotspot_key)
           DO UPDATE SET
             title = EXCLUDED.title,
             city = COALESCE(EXCLUDED.city, hotspots.city),
             ward = EXCLUDED.ward,
             zone = EXCLUDED.zone,
             center_latitude = EXCLUDED.center_latitude,
             center_longitude = EXCLUDED.center_longitude,
             radius_meters = EXCLUDED.radius_meters,
             dominant_category = EXCLUDED.dominant_category,
             issue_categories = EXCLUDED.issue_categories,
             category_counts = EXCLUDED.category_counts,
             complaint_count = EXCLUDED.complaint_count,
             open_count = EXCLUDED.open_count,
             density_per_sq_km = EXCLUDED.density_per_sq_km,
             recurrence_score = EXCLUDED.recurrence_score,
             confidence = EXCLUDED.confidence,
             severity = EXCLUDED.severity,
             has_cross_category_overlap = EXCLUDED.has_cross_category_overlap,
             overlap_categories = EXCLUDED.overlap_categories,
             overlap_summary = EXCLUDED.overlap_summary,
             time_window_days = EXCLUDED.time_window_days,
             first_reported_at = COALESCE(LEAST(hotspots.first_reported_at, EXCLUDED.first_reported_at), EXCLUDED.first_reported_at),
             last_reported_at = COALESCE(GREATEST(hotspots.last_reported_at, EXCLUDED.last_reported_at), EXCLUDED.last_reported_at),
             status = CASE
               WHEN EXCLUDED.open_count = 0 THEN 'RESOLVED'
               WHEN hotspots.status = 'RESOLVED' AND EXCLUDED.open_count > 0 THEN 'ACTIVE'
               ELSE hotspots.status
             END,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
           RETURNING *`
        : `INSERT INTO hotspots (
             hotspot_key,
             title,
             ward,
             zone,
             center_latitude,
             center_longitude,
             radius_meters,
             dominant_category,
             issue_categories,
             category_counts,
             complaint_count,
             open_count,
             density_per_sq_km,
             recurrence_score,
             confidence,
             severity,
             has_cross_category_overlap,
             overlap_categories,
             overlap_summary,
             time_window_days,
             first_reported_at,
             last_reported_at,
             status,
             metadata,
             detected_at,
             updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
             $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20,
             $21, $22, $23, $24::jsonb, NOW(), NOW()
           )
           ON CONFLICT (hotspot_key)
           DO UPDATE SET
             title = EXCLUDED.title,
             ward = EXCLUDED.ward,
             zone = EXCLUDED.zone,
             center_latitude = EXCLUDED.center_latitude,
             center_longitude = EXCLUDED.center_longitude,
             radius_meters = EXCLUDED.radius_meters,
             dominant_category = EXCLUDED.dominant_category,
             issue_categories = EXCLUDED.issue_categories,
             category_counts = EXCLUDED.category_counts,
             complaint_count = EXCLUDED.complaint_count,
             open_count = EXCLUDED.open_count,
             density_per_sq_km = EXCLUDED.density_per_sq_km,
             recurrence_score = EXCLUDED.recurrence_score,
             confidence = EXCLUDED.confidence,
             severity = EXCLUDED.severity,
             has_cross_category_overlap = EXCLUDED.has_cross_category_overlap,
             overlap_categories = EXCLUDED.overlap_categories,
             overlap_summary = EXCLUDED.overlap_summary,
             time_window_days = EXCLUDED.time_window_days,
             first_reported_at = COALESCE(LEAST(hotspots.first_reported_at, EXCLUDED.first_reported_at), EXCLUDED.first_reported_at),
             last_reported_at = COALESCE(GREATEST(hotspots.last_reported_at, EXCLUDED.last_reported_at), EXCLUDED.last_reported_at),
             status = CASE
               WHEN EXCLUDED.open_count = 0 THEN 'RESOLVED'
               WHEN hotspots.status = 'RESOLVED' AND EXCLUDED.open_count > 0 THEN 'ACTIVE'
               ELSE hotspots.status
             END,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
           RETURNING *`,
      hasCityCol
        ? [
            hotspotData.hotspotKey,
            hotspotData.title,
            hotspotData.city || null,
            hotspotData.ward,
            hotspotData.zone,
            hotspotData.centerLatitude,
            hotspotData.centerLongitude,
            hotspotData.radiusMeters,
            hotspotData.dominantCategory,
            JSON.stringify(hotspotData.issueCategories || []),
            JSON.stringify(hotspotData.categoryCounts || {}),
            hotspotData.complaintCount,
            hotspotData.openCount,
            hotspotData.densityPerSqKm,
            hotspotData.recurrenceScore,
            hotspotData.confidence,
            hotspotData.severity,
            Boolean(hotspotData.hasCrossCategoryOverlap),
            JSON.stringify(hotspotData.overlapCategories || []),
            hotspotData.overlapSummary || null,
            hotspotData.timeWindowDays ?? null,
            hotspotData.firstReportedAt || null,
            hotspotData.lastReportedAt || null,
            status,
            JSON.stringify(hotspotData.metadata || {}),
          ]
        : [
            hotspotData.hotspotKey,
            hotspotData.title,
            hotspotData.ward,
            hotspotData.zone,
            hotspotData.centerLatitude,
            hotspotData.centerLongitude,
            hotspotData.radiusMeters,
            hotspotData.dominantCategory,
            JSON.stringify(hotspotData.issueCategories || []),
            JSON.stringify(hotspotData.categoryCounts || {}),
            hotspotData.complaintCount,
            hotspotData.openCount,
            hotspotData.densityPerSqKm,
            hotspotData.recurrenceScore,
            hotspotData.confidence,
            hotspotData.severity,
            Boolean(hotspotData.hasCrossCategoryOverlap),
            JSON.stringify(hotspotData.overlapCategories || []),
            hotspotData.overlapSummary || null,
            hotspotData.timeWindowDays ?? null,
            hotspotData.firstReportedAt || null,
            hotspotData.lastReportedAt || null,
            status,
            JSON.stringify(hotspotData.metadata || {}),
          ],
    );

    const savedHotspot = upsertRes.rows[0];

    await client.query(
      "DELETE FROM hotspot_complaints WHERE hotspot_id = $1",
      [savedHotspot.id],
    );

    for (const member of memberComplaints) {
      await client.query(
        `INSERT INTO hotspot_complaints (
           hotspot_id,
           complaint_id,
           distance_from_center_meters
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (hotspot_id, complaint_id) DO NOTHING`,
        [
          savedHotspot.id,
          member.complaintId,
          member.distanceFromCenterMeters ?? null,
        ],
      );
    }

    await client.query("COMMIT");
    return savedHotspot;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listHotspots({
  city = null,
  status = null,
  ward = null,
  overlapOnly = false,
  limit = 50,
} = {}) {
  const exists = await hasHotspotsTables();
  if (!exists) {
    return [];
  }

  const hasCityCol = await supportsHotspotsCityColumn();
  const values = [];
  const conditions = [];

  if (hasCityCol && city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(h.city, '')) = LOWER($${values.length})`);
  }

  if (status && status.toUpperCase() !== "ALL") {
    values.push(status.trim().toUpperCase());
    conditions.push(`h.status = $${values.length}`);
  }

  if (ward && ward.trim()) {
    values.push(ward.trim());
    conditions.push(`LOWER(COALESCE(h.ward, '')) = LOWER($${values.length})`);
  }

  if (overlapOnly) {
    conditions.push("h.has_cross_category_overlap = TRUE");
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  values.push(parsedLimit);
  const limitParam = `$${values.length}`;

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const hotspotRes = await pool.query(
    `SELECT h.*
     FROM hotspots h
     ${whereClause}
     ORDER BY h.has_cross_category_overlap DESC, h.complaint_count DESC, h.updated_at DESC
     LIMIT ${limitParam}`,
    values,
  );

  if (hotspotRes.rows.length === 0) {
    return [];
  }

  const hotspotIds = hotspotRes.rows.map((r) => r.id);
  const membersRes = await pool.query(
    `SELECT
       hc.hotspot_id,
       hc.distance_from_center_meters,
       c.id,
       c.reference_id,
       c.title,
       c.description,
       c.category,
       ${CANONICAL_CATEGORY_SQL} AS canonical_category,
       c.status,
       c.priority,
       c.address,
       c.city,
       c.ward,
       c.zone,
       c.latitude,
       c.longitude,
       c.created_at
     FROM hotspot_complaints hc
     INNER JOIN complaints c ON c.id = hc.complaint_id
     WHERE hc.hotspot_id = ANY($1::uuid[])
     ORDER BY hc.distance_from_center_meters ASC NULLS LAST, c.created_at DESC`,
    [hotspotIds],
  );

  const membersByHotspot = new Map();
  for (const m of membersRes.rows) {
    const arr = membersByHotspot.get(m.hotspot_id) || [];
    arr.push(m);
    membersByHotspot.set(m.hotspot_id, arr);
  }

  return hotspotRes.rows.map((h) => ({
    ...h,
    members: membersByHotspot.get(h.id) || [],
  }));
}

async function queryWardComplaintStats({
  city = null,
  timeWindowDays = null,
  category = null,
} = {}) {
  const values = [];
  const conditions = [];

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  if (category) {
    values.push(category.trim().toUpperCase());
    const catParam = `$${values.length}`;
    conditions.push(`(${CANONICAL_CATEGORY_SQL}) = (${canonicalCategoryParamSql(catParam)})`);
  }

  if (Number.isFinite(Number(timeWindowDays)) && Number(timeWindowDays) > 0) {
    values.push(Number(timeWindowDays));
    conditions.push(`c.created_at >= NOW() - ($${values.length} * INTERVAL '1 day')`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const hasAdminGeo = await supportsAdministrativeGeographyColumns();
  const adminGeoSelect = hasAdminGeo
    ? `c.administrative_ward_id,
       c.administrative_zone_id,
       c.administrative_boundary_version_id,`
    : `NULL::text AS administrative_ward_id,
       NULL::text AS administrative_zone_id,
       NULL::text AS administrative_boundary_version_id,`;

  const rowsRes = await pool.query(
    `SELECT
       COALESCE(NULLIF(TRIM(c.city), ''), 'General Jurisdiction') AS city,
       COALESCE(NULLIF(TRIM(c.ward), ''), 'Unassigned Ward') AS ward,
       COALESCE(NULLIF(TRIM(c.zone), ''), 'General Jurisdiction') AS zone,
       ${adminGeoSelect}
       ${CANONICAL_CATEGORY_SQL} AS canonical_category,
       c.status,
       COALESCE(c.priority, c.ai_priority, 'MEDIUM') AS effective_priority,
       c.latitude,
       c.longitude,
       c.created_at
     FROM complaints c
     ${whereClause}`,
    values,
  );

  const hotspotsExist = await hasHotspotsTables();
  let hotspotCountsByWard = new Map();

  if (hotspotsExist) {
    const hasCityCol = await supportsHotspotsCityColumn();
    const hValues = [];
    const hConditions = [];
    if (hasCityCol && city && city.trim() && city.trim().toLowerCase() !== "all") {
      hValues.push(city.trim());
      hConditions.push(`LOWER(COALESCE(city, '')) = LOWER($${hValues.length})`);
    }
    const hWhere = hConditions.length ? `WHERE ${hConditions.join(" AND ")}` : "";
    const cityExpr = hasCityCol
      ? "COALESCE(NULLIF(TRIM(city), ''), 'General Jurisdiction')"
      : "'General Jurisdiction'";

    const hRes = await pool.query(
      `SELECT
         ${cityExpr} AS city,
         COALESCE(NULLIF(TRIM(ward), ''), 'Unassigned Ward') AS ward,
         COUNT(*)::int AS active_hotspots,
         COUNT(*) FILTER (WHERE has_cross_category_overlap = TRUE)::int AS overlap_hotspots
       FROM hotspots
       ${hWhere}
       GROUP BY ${cityExpr}, COALESCE(NULLIF(TRIM(ward), ''), 'Unassigned Ward')`,
      hValues,
    );
    hotspotCountsByWard = new Map();
    for (const r of hRes.rows) {
      hotspotCountsByWard.set(`${r.city}::${r.ward}`, {
        activeHotspots: r.active_hotspots || 0,
        overlapHotspots: r.overlap_hotspots || 0,
      });
    }
  }

  return {
    rows: rowsRes.rows,
    hotspotCountsByWard,
  };
}

async function findHotspotsByComplaintId(complaintId) {
  const exists = await hasHotspotsTables();
  if (!exists) {
    return [];
  }

  const res = await pool.query(
    `SELECT
       h.*,
       hc.distance_from_center_meters
     FROM hotspot_complaints hc
     INNER JOIN hotspots h ON h.id = hc.hotspot_id
     WHERE hc.complaint_id = $1
     ORDER BY h.has_cross_category_overlap DESC, h.complaint_count DESC, h.updated_at DESC`,
    [complaintId],
  );

  return res.rows;
}

async function listCityComplaintSummaries() {
  const hotspotsExist = await hasHotspotsTables();
  const hasHotspotsCity = hotspotsExist ? await supportsHotspotsCityColumn() : false;

  const complaintStatsRes = await pool.query(
    `SELECT
       COALESCE(NULLIF(TRIM(city), ''), 'General Jurisdiction') AS city,
       COUNT(*)::int AS complaint_count,
       COUNT(*) FILTER (WHERE UPPER(status) NOT IN ('RESOLVED', 'REJECTED'))::int AS open_count,
       ROUND(AVG(latitude)::numeric, 6)::double precision AS avg_lat,
       ROUND(AVG(longitude)::numeric, 6)::double precision AS avg_lng
     FROM complaints
     GROUP BY COALESCE(NULLIF(TRIM(city), ''), 'General Jurisdiction')
     ORDER BY complaint_count DESC, city ASC`,
  );

  let hotspotMap = new Map();
  if (hotspotsExist && hasHotspotsCity) {
    const hsRes = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(city), ''), 'General Jurisdiction') AS city,
         COUNT(*)::int AS hotspot_count,
         COUNT(*) FILTER (WHERE has_cross_category_overlap = TRUE)::int AS overlap_count
       FROM hotspots
       GROUP BY COALESCE(NULLIF(TRIM(city), ''), 'General Jurisdiction')`,
    );
    hotspotMap = new Map(
      hsRes.rows.map((r) => [
        r.city,
        {
          hotspotCount: r.hotspot_count || 0,
          overlapCount: r.overlap_count || 0,
        },
      ]),
    );
  }

  return complaintStatsRes.rows.map((row) => {
    const hs = hotspotMap.get(row.city) || { hotspotCount: 0, overlapCount: 0 };
    return {
      city: row.city,
      complaintCount: row.complaint_count || 0,
      openCount: row.open_count || 0,
      hotspotCount: hs.hotspotCount,
      overlapCount: hs.overlapCount,
      center:
        row.avg_lat != null && row.avg_lng != null
          ? { latitude: Number(row.avg_lat), longitude: Number(row.avg_lng) }
          : null,
    };
  });
}

module.exports = {
  hasHotspotsTables,
  upsertHotspotWithMembers,
  listHotspots,
  queryWardComplaintStats,
  findHotspotsByComplaintId,
  listCityComplaintSummaries,
};
