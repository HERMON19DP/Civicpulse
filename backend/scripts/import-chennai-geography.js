const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load backend environment variables before initializing pg.Pool.
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Check backend/.env before importing geography.",
  );
}

const pool = require("../src/config/database");

const DATA_DIR = path.resolve(__dirname, "../data/geography/chennai/source");

const WARDS_FILE = path.join(DATA_DIR, "Wards.geojson");
const ZONES_FILE = path.join(DATA_DIR, "Zones.geojson");

const DATASET_KEY = "GCC_CHENNAI_ADMIN_BOUNDARIES";
const VERSION_LABEL = "datameet-chennai-initial";
const SOURCE_AUTHORITY = "DataMeet";
const SOURCE_NAME = "Chennai Municipal Spatial Data";
const SOURCE_URL =
  "https://github.com/datameet/Municipal_Spatial_Data/tree/master/Chennai";
const LICENCE = "CC BY-SA 2.5 India";

const ROMAN_TO_NUMBER = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
};

function readGeoJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`GeoJSON file not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${path.basename(filePath)} is not a FeatureCollection`);
  }

  return parsed;
}

function checksumFiles() {
  const hash = crypto.createHash("sha256");

  hash.update(fs.readFileSync(WARDS_FILE));
  hash.update(fs.readFileSync(ZONES_FILE));

  return hash.digest("hex");
}

function normalizePolygonGeometry(geometry) {
  if (!geometry) {
    throw new Error("Feature has no geometry");
  }

  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  return geometry;
}

function normalizeZones(zoneCollection) {
  const zones = zoneCollection.features
    .filter((feature) => {
      const zoneNo = String(feature.properties?.Zone_No || "").trim();
      return Boolean(ROMAN_TO_NUMBER[zoneNo]);
    })
    .map((feature) => {
      const zoneNo = String(feature.properties.Zone_No).trim();
      const zoneNumber = ROMAN_TO_NUMBER[zoneNo];

      return {
        zoneNumber,
        code: `GCC:ZONE:${String(zoneNumber).padStart(2, "0")}`,
        name: `Zone ${zoneNumber}`,
        externalCode: zoneNo,
        geometry: normalizePolygonGeometry(feature.geometry),
      };
    });

  if (zones.length !== 15) {
    throw new Error(`Expected 15 GCC zones; found ${zones.length}`);
  }

  const uniqueNumbers = new Set(zones.map((zone) => zone.zoneNumber));

  if (uniqueNumbers.size !== 15) {
    throw new Error("Duplicate zone numbers detected");
  }

  return zones;
}

function normalizeWards(wardCollection) {
  const wards = wardCollection.features
    .filter((feature) => Number(feature.properties?.Ward_No) > 0)
    .map((feature) => {
      const wardNumber = Number(feature.properties.Ward_No);
      const zoneNumber =
        ROMAN_TO_NUMBER[String(feature.properties.Zone_No || "").trim()];

      if (!Number.isInteger(wardNumber) || wardNumber > 200) {
        throw new Error(`Invalid ward number: ${feature.properties.Ward_No}`);
      }

      if (!zoneNumber) {
        throw new Error(`Invalid zone for ward ${wardNumber}`);
      }

      return {
        wardNumber,
        zoneNumber,
        code: `GCC:WARD:${String(wardNumber).padStart(3, "0")}`,
        name: `Ward ${wardNumber}`,
        geometry: normalizePolygonGeometry(feature.geometry),
      };
    });

  if (wards.length !== 200) {
    throw new Error(`Expected 200 GCC wards; found ${wards.length}`);
  }

  const uniqueNumbers = new Set(wards.map((ward) => ward.wardNumber));

  if (uniqueNumbers.size !== 200) {
    throw new Error("Duplicate ward numbers detected");
  }

  return wards;
}

async function insertUnit(
  client,
  { code, name, unitType, parentId = null, externalCode = null, metadata = {} },
) {
  const result = await client.query(
    `INSERT INTO administrative_units (
       code, name, unit_type, parent_id, authority, external_code, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       parent_id = EXCLUDED.parent_id,
       external_code = EXCLUDED.external_code,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id`,
    [
      code,
      name,
      unitType,
      parentId,
      "Greater Chennai Corporation",
      externalCode,
      JSON.stringify(metadata),
    ],
  );

  return result.rows[0].id;
}

async function insertBoundary(client, unitId, importId, geometry) {
  const result = await client.query(
    `INSERT INTO administrative_boundary_versions (
       administrative_unit_id,
       source_import_id,
       boundary
     )
     VALUES (
       $1,
       $2,
       ST_Multi(
         ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)
       )
     )
     RETURNING id`,
    [unitId, importId, JSON.stringify(geometry)],
  );

  return result.rows[0].id;
}

async function main() {
  const wardsGeoJson = readGeoJson(WARDS_FILE);
  const zonesGeoJson = readGeoJson(ZONES_FILE);

  const zones = normalizeZones(zonesGeoJson);
  const wards = normalizeWards(wardsGeoJson);
  const checksum = checksumFiles();

  console.log(`Prepared ${wards.length} wards and ${zones.length} zones`);
  console.log(`Source checksum: ${checksum}`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingImport = await client.query(
      `SELECT id, import_status
       FROM geography_source_imports
       WHERE dataset_key = $1
         AND version_label = $2
       FOR UPDATE`,
      [DATASET_KEY, VERSION_LABEL],
    );

    if (existingImport.rows.length > 0) {
      const existing = existingImport.rows[0];

      const existingChecksum = await client.query(
        `SELECT source_checksum
         FROM geography_source_imports
         WHERE id = $1`,
        [existing.id],
      );

      if (existingChecksum.rows[0].source_checksum !== checksum) {
        throw new Error(
          "This version label already exists with a different source checksum. " +
            "Choose a new VERSION_LABEL for the changed dataset.",
        );
      }

      if (existing.import_status === "IMPORTED") {
        await client.query("ROLLBACK");
        console.log(
          "This exact dataset version is already imported. No changes made.",
        );
        return;
      }

      throw new Error(
        `An import with this version label already exists in status ${existing.import_status}`,
      );
    }

    const importResult = await client.query(
      `INSERT INTO geography_source_imports (
         dataset_key,
         version_label,
         source_authority,
         source_name,
         source_url,
         licence,
         source_checksum,
         import_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING id`,
      [
        DATASET_KEY,
        VERSION_LABEL,
        SOURCE_AUTHORITY,
        SOURCE_NAME,
        SOURCE_URL,
        LICENCE,
        checksum,
      ],
    );

    const importId = importResult.rows[0].id;

    const municipalityId = await insertUnit(client, {
      code: "GCC:CHENNAI",
      name: "Greater Chennai Corporation",
      unitType: "MUNICIPALITY",
      externalCode: "GCC",
      metadata: {
        city: "Chennai",
        state: "Tamil Nadu",
        country: "India",
      },
    });

    const zoneIds = new Map();

    for (const zone of zones) {
      const zoneId = await insertUnit(client, {
        code: zone.code,
        name: zone.name,
        unitType: "ZONE",
        parentId: municipalityId,
        externalCode: zone.externalCode,
        metadata: {
          zoneNumber: zone.zoneNumber,
        },
      });

      zoneIds.set(zone.zoneNumber, zoneId);

      await insertBoundary(client, zoneId, importId, zone.geometry);
    }

    const wardBoundaryIds = new Map();

    for (const ward of wards) {
      const zoneId = zoneIds.get(ward.zoneNumber);

      if (!zoneId) {
        throw new Error(
          `Ward ${ward.wardNumber} refers to missing zone ${ward.zoneNumber}`,
        );
      }

      const wardId = await insertUnit(client, {
        code: ward.code,
        name: ward.name,
        unitType: "WARD",
        parentId: zoneId,
        externalCode: String(ward.wardNumber),
        metadata: {
          wardNumber: ward.wardNumber,
          zoneNumber: ward.zoneNumber,
        },
      });

      const boundaryId = await insertBoundary(
        client,
        wardId,
        importId,
        ward.geometry,
      );

      wardBoundaryIds.set(ward.wardNumber, boundaryId);
    }

    // Validate imported counts and geometry validity in PostGIS.
    const validation = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE u.unit_type = 'WARD')::int AS ward_count,
         COUNT(*) FILTER (WHERE u.unit_type = 'ZONE')::int AS zone_count,
         COUNT(*) FILTER (
           WHERE NOT ST_IsValid(b.boundary)
         )::int AS invalid_geometry_count
       FROM administrative_boundary_versions b
       JOIN administrative_units u
         ON u.id = b.administrative_unit_id
       WHERE b.source_import_id = $1`,
      [importId],
    );

    const result = validation.rows[0];

    if (
      result.ward_count !== 200 ||
      result.zone_count !== 15 ||
      result.invalid_geometry_count !== 0
    ) {
      throw new Error(`PostGIS validation failed: ${JSON.stringify(result)}`);
    }

    // Validate ward-to-zone containment while allowing negligible
    // floating-point differences along shared polygon boundaries.
    const hierarchyCheck = await client.query(
      `SELECT
     COUNT(*) FILTER (
       WHERE
         NOT ST_Intersects(zb.boundary, wb.boundary)
         OR
         (
           ST_Area(ST_Difference(wb.boundary, zb.boundary))
           / NULLIF(ST_Area(wb.boundary), 0)
         ) > 0.00000001
     )::int AS invalid_count,

     MAX(
       ST_Area(ST_Difference(wb.boundary, zb.boundary))
       / NULLIF(ST_Area(wb.boundary), 0)
     ) AS max_uncovered_area_ratio

   FROM administrative_units ward

   JOIN administrative_units zone
     ON zone.id = ward.parent_id

   JOIN administrative_boundary_versions wb
     ON wb.administrative_unit_id = ward.id
    AND wb.source_import_id = $1

   JOIN administrative_boundary_versions zb
     ON zb.administrative_unit_id = zone.id
    AND zb.source_import_id = $1

   WHERE ward.unit_type = 'WARD'
     AND zone.unit_type = 'ZONE'`,
      [importId],
    );

    if (hierarchyCheck.rows[0].invalid_count !== 0) {
      throw new Error(
        `Ward-zone validation failed: ${JSON.stringify(hierarchyCheck.rows[0])}`,
      );
    }

    await client.query(
      `UPDATE geography_source_imports
       SET import_status = 'IMPORTED',
           imported_at = NOW(),
           validation_report = $2::jsonb
       WHERE id = $1`,
      [
        importId,
        JSON.stringify({
          wardCount: result.ward_count,
          zoneCount: result.zone_count,
          invalidGeometryCount: result.invalid_geometry_count,
          invalidWardZoneCount: hierarchyCheck.rows[0].invalid_count,
          excludedFeatures: ["Ward 0", "St. Thomas Mount zone polygon"],
        }),
      ],
    );

    await client.query("COMMIT");

    console.log("Chennai geography import completed successfully.");
    console.log({
      importId,
      wards: result.ward_count,
      zones: result.zone_count,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Chennai geography import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
