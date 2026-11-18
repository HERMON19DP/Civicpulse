const pool = require("../config/database");

async function listAssets({
  city = null,
  ward = null,
  assetType = null,
  grade = null,
  sortBy = "lowest_health",
  limit = 100,
} = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (city && city !== "all") {
    conditions.push(`LOWER(COALESCE(a.city, '')) = LOWER($${idx})`);
    params.push(city);
    idx += 1;
  }

  if (ward && ward !== "all") {
    conditions.push(`LOWER(COALESCE(a.ward, '')) = LOWER($${idx})`);
    params.push(ward);
    idx += 1;
  }

  if (assetType && assetType !== "all") {
    conditions.push(`a.asset_type = $${idx}`);
    params.push(assetType);
    idx += 1;
  }

  if (grade && grade !== "all") {
    conditions.push(`a.health_grade = $${idx}`);
    params.push(grade);
    idx += 1;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderClause =
    "a.health_score ASC, a.open_complaint_count DESC, a.updated_at DESC";
  if (sortBy === "most_complaints") {
    orderClause =
      "a.open_complaint_count DESC, a.complaint_count DESC, a.health_score ASC";
  } else if (sortBy === "maintenance_age") {
    orderClause = "a.last_maintained_at ASC NULLS FIRST, a.health_score ASC";
  } else if (sortBy === "highest_health") {
    orderClause = "a.health_score DESC, a.updated_at DESC";
  }

  params.push(Math.min(Math.max(Number(limit) || 100, 1), 250));

  const res = await pool.query(
    `SELECT a.*,
            (
              SELECT COUNT(*)::int
              FROM maintenance_events m
              WHERE m.asset_id = a.id
            ) AS maintenance_event_count
     FROM infrastructure_assets a
     ${whereClause}
     ORDER BY ${orderClause}
     LIMIT $${idx}`,
    params,
  );

  return res.rows;
}

async function findAssetById(id) {
  const res = await pool.query(
    `SELECT a.*
     FROM infrastructure_assets a
     WHERE a.id = $1
     LIMIT 1`,
    [id],
  );
  return res.rows[0] || null;
}

async function findAssetByCode(assetCode) {
  const res = await pool.query(
    `SELECT *
     FROM infrastructure_assets
     WHERE LOWER(asset_code) = LOWER($1)
     LIMIT 1`,
    [assetCode],
  );
  return res.rows[0] || null;
}

async function createAsset(data) {
  const res = await pool.query(
    `INSERT INTO infrastructure_assets (
       asset_code,
       name,
       asset_type,
       city,
       ward,
       zone,
       address,
       latitude,
       longitude,
       catchment_radius_meters,
       department,
       install_date,
       last_maintained_at,
       metadata,
       administrative_ward_id,
       administrative_zone_id,
       administrative_boundary_version_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14::jsonb,
       $15, $16, $17
     )
     RETURNING *`,
    [
      data.assetCode,
      data.name,
      data.assetType,
      data.city || null,
      data.ward || null,
      data.zone || null,
      data.address || null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.catchmentRadiusMeters ?? 250,
      data.department,
      data.installDate || null,
      data.lastMaintainedAt || null,
      JSON.stringify(data.metadata || {}),
      data.administrativeWardId || null,
      data.administrativeZoneId || null,
      data.administrativeBoundaryVersionId || null,
    ],
  );

  return res.rows[0];
}

async function fetchAllScorableComplaints({ city = null } = {}) {
  const params = [];
  let cityFilter = "";
  if (city && city !== "all") {
    params.push(city);
    cityFilter = `WHERE LOWER(COALESCE(c.city, '')) = LOWER($1)`;
  }

  const res = await pool.query(
    `SELECT c.id,
            c.reference_id,
            c.title,
            c.description,
            c.category,
            COALESCE(c.ai_category, c.category) AS canonical_category,
            COALESCE(c.ai_priority, c.priority) AS effective_priority,
            c.priority,
            c.status,
            c.city,
            c.ward,
            c.zone,
            c.address,
            c.latitude,
            c.longitude,
            c.created_at,
            c.updated_at,
            COALESCE((
              SELECT COUNT(*)::int FROM complaint_upvotes u WHERE u.complaint_id = c.id
            ), 0) AS upvote_count,
            EXISTS (
              SELECT 1
              FROM hotspot_complaints hc
              JOIN hotspots h ON h.id = hc.hotspot_id
              WHERE hc.complaint_id = c.id AND h.status = 'ACTIVE'
            ) AS in_active_hotspot
     FROM complaints c
     ${cityFilter}
     ORDER BY c.created_at DESC`,
    params,
  );
  return res.rows;
}

async function replaceAutoComplaintLinks(assetId, links) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM complaint_asset_links
       WHERE asset_id = $1 AND link_type <> 'MANUAL'`,
      [assetId],
    );

    for (const link of links) {
      await client.query(
        `INSERT INTO complaint_asset_links (
           complaint_id, asset_id, distance_meters, link_type, link_confidence, link_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (complaint_id, asset_id) DO UPDATE SET
           distance_meters = EXCLUDED.distance_meters,
           link_type = CASE
             WHEN complaint_asset_links.link_type = 'MANUAL' THEN 'MANUAL'
             ELSE EXCLUDED.link_type
           END,
           link_confidence = EXCLUDED.link_confidence,
           link_reason = EXCLUDED.link_reason`,
        [
          link.complaintId,
          assetId,
          link.distanceMeters,
          link.linkType,
          link.confidence,
          link.reason,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function fetchLinkedComplaintsForAsset(assetId) {
  const res = await pool.query(
    `SELECT c.id,
            c.reference_id,
            c.title,
            c.description,
            c.category,
            COALESCE(c.ai_category, c.category) AS canonical_category,
            COALESCE(c.ai_priority, c.priority) AS effective_priority,
            c.priority,
            c.status,
            c.city,
            c.ward,
            c.address,
            c.latitude,
            c.longitude,
            c.created_at,
            cal.distance_meters,
            cal.link_type,
            cal.link_confidence,
            cal.link_reason,
            COALESCE((
              SELECT COUNT(*)::int FROM complaint_upvotes u WHERE u.complaint_id = c.id
            ), 0) AS upvote_count,
            EXISTS (
              SELECT 1
              FROM hotspot_complaints hc
              JOIN hotspots h ON h.id = hc.hotspot_id
              WHERE hc.complaint_id = c.id AND h.status = 'ACTIVE'
            ) AS in_active_hotspot
     FROM complaint_asset_links cal
     JOIN complaints c ON c.id = cal.complaint_id
     WHERE cal.asset_id = $1
     ORDER BY
       CASE WHEN cal.link_type = 'DIRECT' THEN 0 ELSE 1 END ASC,
       c.created_at DESC`,
    [assetId],
  );
  return res.rows;
}

async function fetchMaintenanceEvents(assetId) {
  const res = await pool.query(
    `SELECT m.*,
            u.name AS actor_name
     FROM maintenance_events m
     LEFT JOIN users u ON u.id = m.actor_id
     WHERE m.asset_id = $1
     ORDER BY m.performed_at DESC, m.created_at DESC`,
    [assetId],
  );
  return res.rows;
}

async function createMaintenanceEvent({
  assetId,
  eventType,
  outcome = "COMPLETED",
  performedBy = null,
  actorId = null,
  notes = null,
  performedAt = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO maintenance_events (
         asset_id, event_type, outcome, performed_by, actor_id, notes, performed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       RETURNING *`,
      [assetId, eventType, outcome, performedBy, actorId, notes, performedAt],
    );
    const eventRow = inserted.rows[0];

    if (
      outcome === "COMPLETED" &&
      [
        "REPAIR",
        "RESURFACING",
        "REPLACEMENT",
        "CLEANING",
        "PREVENTIVE_MAINTENANCE",
      ].includes(eventType)
    ) {
      await client.query(
        `UPDATE infrastructure_assets
         SET last_maintained_at = GREATEST(
               COALESCE(last_maintained_at, '1970-01-01'::timestamptz),
               $2::timestamptz
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [assetId, eventRow.performed_at],
      );
    }

    await client.query("COMMIT");
    return eventRow;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function updateAssetHealthScore(
  assetId,
  {
    healthScore,
    healthGrade,
    trend,
    complaintCount,
    openComplaintCount,
    recurrenceCount,
    scoreBreakdown,
    recordSnapshot = false,
  },
) {
  const res = await pool.query(
    `UPDATE infrastructure_assets
     SET health_score = $2,
         health_grade = $3,
         trend = $4,
         complaint_count = $5,
         open_complaint_count = $6,
         recurrence_count = $7,
         score_breakdown = $8::jsonb,
         last_scored_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      assetId,
      healthScore,
      healthGrade,
      trend,
      complaintCount,
      openComplaintCount,
      recurrenceCount,
      JSON.stringify(scoreBreakdown || {}),
    ],
  );

  if (recordSnapshot && res.rows[0]) {
    await pool
      .query(
        `INSERT INTO infrastructure_health_history (
           asset_id, health_score, health_grade, complaint_count, open_complaint_count, score_breakdown
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          assetId,
          healthScore,
          healthGrade,
          complaintCount,
          openComplaintCount,
          JSON.stringify(scoreBreakdown || {}),
        ],
      )
      .catch(() => {});
  }

  return res.rows[0] || null;
}

async function insertHealthHistorySnapshot({
  assetId,
  healthScore,
  healthGrade,
  complaintCount = 0,
  openComplaintCount = 0,
  scoreBreakdown = {},
  recordedAt = null,
}) {
  const res = await pool.query(
    `INSERT INTO infrastructure_health_history (
       asset_id, health_score, health_grade, complaint_count, open_complaint_count, score_breakdown, recorded_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, NOW()))
     RETURNING *`,
    [
      assetId,
      healthScore,
      healthGrade,
      complaintCount,
      openComplaintCount,
      JSON.stringify(scoreBreakdown || {}),
      recordedAt,
    ],
  );
  return res.rows[0] || null;
}

async function fetchHealthHistory(assetId, limit = 12) {
  const res = await pool.query(
    `SELECT *
     FROM infrastructure_health_history
     WHERE asset_id = $1
     ORDER BY recorded_at DESC
     LIMIT $2`,
    [assetId, Math.min(Math.max(Number(limit) || 12, 1), 50)],
  );
  return res.rows;
}

async function findAssetsForComplaint(complaintId) {
  const res = await pool.query(
    `SELECT a.*,
            cal.distance_meters,
            cal.link_type,
            cal.link_confidence,
            cal.link_reason
     FROM complaint_asset_links cal
     JOIN infrastructure_assets a ON a.id = cal.asset_id
     WHERE cal.complaint_id = $1
     ORDER BY
       CASE WHEN cal.link_type = 'DIRECT' THEN 0 ELSE 1 END ASC,
       a.health_score ASC`,
    [complaintId],
  );
  return res.rows;
}

async function queryWardHealthInputs({ city = null } = {}) {
  const params = [];
  let assetWhere = "";
  let complaintWhere = "";

  if (city && city !== "all") {
    params.push(city);
    assetWhere = `WHERE LOWER(COALESCE(city, '')) = LOWER($1)`;
    complaintWhere = `WHERE LOWER(COALESCE(city, '')) = LOWER($1)`;
  }

  const [assetsRes, complaintsRes] = await Promise.all([
    pool.query(
      `SELECT id, asset_code, name, asset_type, city, ward, zone,
              health_score, health_grade, trend, complaint_count, open_complaint_count, last_maintained_at
       FROM infrastructure_assets
       ${assetWhere}`,
      params,
    ),
    pool.query(
      `SELECT id, city, ward, zone, status,
              COALESCE(ai_priority, priority) AS effective_priority,
              created_at
       FROM complaints
       ${complaintWhere}`,
      params,
    ),
  ]);

  return {
    assets: assetsRes.rows,
    complaints: complaintsRes.rows,
  };
}

module.exports = {
  listAssets,
  findAssetById,
  findAssetByCode,
  createAsset,
  fetchAllScorableComplaints,
  replaceAutoComplaintLinks,
  fetchLinkedComplaintsForAsset,
  fetchMaintenanceEvents,
  createMaintenanceEvent,
  updateAssetHealthScore,
  insertHealthHistorySnapshot,
  fetchHealthHistory,
  findAssetsForComplaint,
  queryWardHealthInputs,
};
