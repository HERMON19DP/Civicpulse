const pool = require("../../../config/database");

const COORDINATE_BOUNDS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

/**
 * Resolves a coordinate against the latest successfully imported
 * administrative boundary dataset.
 *
 * Returns null when the coordinate does not fall within a known ward.
 * Does not use centroid or address-based fallback.
 */
async function resolveAdministrativeArea({
  latitude,
  longitude,
  datasetKey = "GCC_CHENNAI_ADMIN_BOUNDARIES",
} = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < COORDINATE_BOUNDS.latitude.min ||
    lat > COORDINATE_BOUNDS.latitude.max ||
    lng < COORDINATE_BOUNDS.longitude.min ||
    lng > COORDINATE_BOUNDS.longitude.max
  ) {
    return null;
  }

  const result = await pool.query(
    `WITH active_import AS (
       SELECT id, dataset_key, version_label
       FROM geography_source_imports
       WHERE dataset_key = $1
         AND import_status = 'IMPORTED'
       ORDER BY imported_at DESC NULLS LAST, created_at DESC
       LIMIT 1
     ),
     input_point AS (
       SELECT ST_SetSRID(
         ST_MakePoint($2, $3),
         4326
       ) AS geom
     )
     SELECT
       municipality.id AS municipality_id,
       municipality.code AS municipality_code,
       municipality.name AS municipality_name,
        COALESCE(
        municipality.metadata->>'city',
        municipality.name
        ) AS city,

       zone.id AS zone_id,
       zone.code AS zone_code,
       zone.name AS zone,

       ward.id AS ward_id,
       ward.code AS ward_code,
       ward.name AS ward,

       boundary.id AS boundary_version_id,
       active_import.id AS source_import_id,
       active_import.version_label AS boundary_version

     FROM active_import

     JOIN administrative_boundary_versions boundary
       ON boundary.source_import_id = active_import.id

     JOIN administrative_units ward
       ON ward.id = boundary.administrative_unit_id
      AND ward.unit_type = 'WARD'

     JOIN administrative_units zone
       ON zone.id = ward.parent_id
      AND zone.unit_type = 'ZONE'

     JOIN administrative_units municipality
       ON municipality.id = zone.parent_id
      AND municipality.unit_type = 'MUNICIPALITY'

     CROSS JOIN input_point

     WHERE ST_Covers(
       boundary.boundary,
       input_point.geom
     )

     ORDER BY ST_Area(boundary.boundary) ASC
     LIMIT 1`,
    [datasetKey, lng, lat],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    municipalityId: row.municipality_id,
    municipalityCode: row.municipality_code,
    municipalityName: row.municipality_name,
    city: row.city,

    wardId: row.ward_id,
    wardCode: row.ward_code,
    ward: row.ward,

    zoneId: row.zone_id,
    zoneCode: row.zone_code,
    zone: row.zone,

    boundaryVersionId: row.boundary_version_id,
    sourceImportId: row.source_import_id,
    boundaryVersion: row.boundary_version,

    resolutionMethod: "POSTGIS_POINT_IN_POLYGON",
  };
}

module.exports = {
  resolveAdministrativeArea,
};
