const pool = require("../../config/database");

let hasLocationColumnCache = null;
let hasWardColumnsCache = null;
let hasCityColumnCache = null;

const COMPLAINT_SELECT_FIELDS = `
  c.id,
  c.reference_id,
  c.citizen_id,
  c.title,
  c.description,
  c.category,
  c.department,
  c.city,
  c.ward,
  c.zone,
  c.assigned_officer_id,
  ao.name AS assigned_officer_name,
  ao.email AS assigned_officer_email,
  c.address,
  c.status,
  c.priority,
  c.latitude,
  c.longitude,
  c.possible_duplicate_of_id,
  c.ai_category,
  c.ai_priority,
  c.ai_summary,
  c.ai_confidence,
  c.ai_tags,
  c.ai_metadata,
  c.enrichment_status,
  c.enriched_at,
  c.created_at,
  c.updated_at
`;

async function supportsPostGisLocation(db = pool) {
  if (hasLocationColumnCache !== null) {
    return hasLocationColumnCache;
  }

  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'complaints'
           AND column_name = 'location'
       ) AS has_location`,
    );
    hasLocationColumnCache = Boolean(res.rows[0]?.has_location);
  } catch {
    hasLocationColumnCache = false;
  }

  return hasLocationColumnCache;
}

async function supportsWardColumns(db = pool) {
  if (hasWardColumnsCache === true) {
    return true;
  }

  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'complaints'
           AND column_name = 'ward'
       ) AS has_ward`,
    );
    const exists = Boolean(res.rows[0]?.has_ward);
    if (exists) {
      hasWardColumnsCache = true;
    }
    return exists;
  } catch {
    return false;
  }
}

async function supportsCityColumn(db = pool) {
  if (hasCityColumnCache === true) {
    return true;
  }

  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'complaints'
           AND column_name = 'city'
       ) AS has_city`,
    );
    const exists = Boolean(res.rows[0]?.has_city);
    if (exists) {
      hasCityColumnCache = true;
    }
    return exists;
  } catch {
    return false;
  }
}

function buildCategoryFilter(category, values, alias = "c") {
  const normalized = category.trim().toUpperCase();
  const col = alias ? `${alias}.category` : "category";

  if (normalized === "ROAD" || normalized === "ROADS") {
    return `UPPER(TRIM(${col})) IN ('ROAD', 'ROADS')`;
  }

  if (
    normalized === "ELECTRICITY" ||
    normalized === "STREET_LIGHT" ||
    normalized === "STREETLIGHT"
  ) {
    return `UPPER(TRIM(${col})) IN ('ELECTRICITY', 'STREET_LIGHT', 'STREETLIGHT')`;
  }

  values.push(normalized);
  return `UPPER(TRIM(${col})) = $${values.length}`;
}

async function createComplaint({
  citizenId,
  title,
  description,
  category,
  department = null,
  city = null,
  ward = null,
  zone = null,
  address,
  latitude,
  longitude,
  db = pool,
  administrativeWardId = null,
  administrativeZoneId = null,
  administrativeBoundaryVersionId = null,
}) {
  const [hasLocation, hasWard, hasCity] = await Promise.all([
    supportsPostGisLocation(db),
    supportsWardColumns(db),
    supportsCityColumn(db),
  ]);

  const baseCols = [
    "citizen_id",
    "title",
    "description",
    "category",
    "department",
    ...(hasCity ? ["city"] : []),
    ...(hasWard ? ["ward", "zone"] : []),
    "address",
    "latitude",
    "longitude",
    "administrative_ward_id",
    "administrative_zone_id",
    "administrative_boundary_version_id",
  ];
  const values = [
    citizenId,
    title,
    description,
    category,
    department,
    ...(hasCity ? [city] : []),
    ...(hasWard ? [ward, zone] : []),
    address,
    latitude,
    longitude,
    administrativeWardId,
    administrativeZoneId,
    administrativeBoundaryVersionId,
  ];

  const latParamIdx = baseCols.indexOf("latitude") + 1;
  const lngParamIdx = baseCols.indexOf("longitude") + 1;
  const placeholders = values.map((_, i) => `$${i + 1}`);

  if (hasLocation) {
    baseCols.push("location");
    placeholders.push(
      `ST_SetSRID(ST_MakePoint($${lngParamIdx}, $${latParamIdx}), 4326)::geography`,
    );
  }

  const query = `
    INSERT INTO complaints (${baseCols.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING id
  `;

  const result = await db.query(query, values);

  return findComplaintById(result.rows[0].id, db);
}

async function findComplaintById(id, db = pool) {
  const result = await db.query(
    `SELECT ${COMPLAINT_SELECT_FIELDS}
     FROM complaints c
     LEFT JOIN users ao ON ao.id = c.assigned_officer_id
     WHERE c.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function findComplaintsByCitizenId(citizenId) {
  const result = await pool.query(
    `SELECT ${COMPLAINT_SELECT_FIELDS}
     FROM complaints c
     LEFT JOIN users ao ON ao.id = c.assigned_officer_id
     WHERE c.citizen_id = $1
     ORDER BY c.created_at DESC`,
    [citizenId],
  );

  return result.rows;
}

async function updateComplaintStatus(
  id,
  status,
  { assignedOfficerId, possibleDuplicateOfId } = {},
  db = pool,
) {
  const setClauses = ["status = $1", "updated_at = NOW()"];
  const values = [status];

  if (assignedOfficerId !== undefined) {
    values.push(assignedOfficerId);
    setClauses.push(`assigned_officer_id = $${values.length}`);
  }

  if (possibleDuplicateOfId !== undefined) {
    values.push(possibleDuplicateOfId);
    setClauses.push(`possible_duplicate_of_id = $${values.length}`);
  }

  values.push(id);
  await db.query(
    `UPDATE complaints
     SET ${setClauses.join(", ")}
     WHERE id = $${values.length}`,
    values,
  );

  return findComplaintById(id, db);
}

async function assignComplaintOfficer(id, officerId, db = pool) {
  await db.query(
    `UPDATE complaints
     SET assigned_officer_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [officerId, id],
  );

  return findComplaintById(id, db);
}

async function findAllComplaints({
  status,
  category,
  city,
  query,
  limit,
} = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status.trim().toUpperCase());
    conditions.push(`c.status = $${values.length}`);
  }

  if (category) {
    conditions.push(buildCategoryFilter(category, values, "c"));
  }

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  if (query) {
    values.push(`%${query}%`);
    const index = values.length;
    conditions.push(
      `(c.title ILIKE $${index} OR c.description ILIKE $${index} OR c.reference_id ILIKE $${index} OR COALESCE(c.city, '') ILIKE $${index} OR COALESCE(c.ward, '') ILIKE $${index})`,
    );
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  let limitClause = "";
  if (limit !== undefined && limit !== null && limit !== "") {
    const parsedLimit = Number(limit);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      values.push(Math.min(parsedLimit, 500));
      limitClause = `LIMIT $${values.length}`;
    }
  }

  const result = await pool.query(
    `SELECT ${COMPLAINT_SELECT_FIELDS}
     FROM complaints c
     LEFT JOIN users ao ON ao.id = c.assigned_officer_id
     ${whereClause}
     ORDER BY c.created_at DESC
     ${limitClause}`,
    values,
  );

  return result.rows;
}

async function findMapComplaints({ status, category, city } = {}) {
  const conditions = ["c.latitude IS NOT NULL", "c.longitude IS NOT NULL"];
  const values = [];

  if (status) {
    values.push(status.trim().toUpperCase());
    conditions.push(`c.status = $${values.length}`);
  }

  if (category) {
    conditions.push(buildCategoryFilter(category, values, "c"));
  }

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  const result = await pool.query(
    `SELECT ${COMPLAINT_SELECT_FIELDS}
     FROM complaints c
     LEFT JOIN users ao ON ao.id = c.assigned_officer_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.created_at DESC`,
    values,
  );

  return result.rows;
}

async function findNearbyPublicComplaints({
  latitude,
  longitude,
  radiusMeters = 5000,
  category,
  city = null,
  limit = 100,
} = {}) {
  const values = [latitude, longitude, radiusMeters];
  const conditions = ["c.latitude IS NOT NULL", "c.longitude IS NOT NULL"];

  if (category) {
    conditions.push(buildCategoryFilter(category, values, "c"));
  }

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  values.push(Math.min(Math.max(Number(limit) || 100, 1), 300));
  const limitParam = `$${values.length}`;

  const result = await pool.query(
    `SELECT *
     FROM (
       SELECT
         c.id,
         c.reference_id,
         c.citizen_id,
         c.title,
         c.description,
         c.category,
         c.department,
         c.status,
         c.priority,
         c.address,
         c.city,
         c.ward,
         c.zone,
         c.latitude,
         c.longitude,
         c.ai_summary,
         c.created_at,
         c.updated_at,
         COALESCE(u.upvote_count, 0)::int AS upvote_count,
         ROUND(
           (
             6371000 * ACOS(
               LEAST(
                 1.0,
                 GREATEST(
                   -1.0,
                   COS(RADIANS($1)) * COS(RADIANS(c.latitude)) *
                   COS(RADIANS(c.longitude) - RADIANS($2)) +
                   SIN(RADIANS($1)) * SIN(RADIANS(c.latitude))
                 )
               )
             )
           )::numeric,
           2
         )::double precision AS distance_meters
       FROM complaints c
       LEFT JOIN (
         SELECT complaint_id, COUNT(*)::int AS upvote_count
         FROM complaint_upvotes
         GROUP BY complaint_id
       ) u ON u.complaint_id = c.id
       WHERE ${conditions.join(" AND ")}
     ) nearby
     WHERE nearby.distance_meters <= $3
     ORDER BY nearby.distance_meters ASC, nearby.created_at DESC
     LIMIT ${limitParam}`,
    values,
  );

  return result.rows;
}

async function getComplaintStats() {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
       COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW')::int AS under_review,
       COUNT(*) FILTER (WHERE status = 'ASSIGNED')::int AS assigned,
       COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
       COUNT(*) FILTER (WHERE status = 'NEEDS_INFORMATION')::int AS needs_information,
       COUNT(*) FILTER (WHERE status = 'DUPLICATE_SUSPECTED')::int AS duplicate_suspected,
       COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
       COUNT(*) FILTER (
         WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION')
       )::int AS pending,
       COUNT(*) FILTER (
         WHERE status IN ('ASSIGNED', 'IN_PROGRESS')
       )::int AS active_in_progress,
       COUNT(*) FILTER (
         WHERE status = 'RESOLVED'
           AND updated_at >= NOW() - INTERVAL '30 days'
       )::int AS resolved_last_30_days,
       COUNT(*) FILTER (
         WHERE status NOT IN ('RESOLVED', 'REJECTED')
           AND created_at < NOW() - INTERVAL '7 days'
       )::int AS overdue,
       COUNT(*) FILTER (
         WHERE created_at >= DATE_TRUNC('day', NOW())
       )::int AS created_today
     FROM complaints`,
  );

  return result.rows[0];
}

async function complaintExists(id) {
  const result = await pool.query(
    `SELECT 1
     FROM complaints
     WHERE id = $1`,
    [id],
  );

  return result.rows.length > 0;
}

module.exports = {
  createComplaint,
  findComplaintById,
  findComplaintsByCitizenId,
  updateComplaintStatus,
  assignComplaintOfficer,
  complaintExists,
  findAllComplaints,
  findMapComplaints,
  findNearbyPublicComplaints,
  getComplaintStats,
};
