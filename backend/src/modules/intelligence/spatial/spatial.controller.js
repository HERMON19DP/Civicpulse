const { spatialAnalyzeSchema } = require("./spatial.schema");
const { analyzeNearbyComplaints } = require("./spatial.service");
const { detectHotspotsSchema } = require("./hotspot.schema");
const {
  detectAndPersistHotspots,
  listSavedHotspots,
  getWardAnalytics,
  listActiveCities,
  geocodePlaceQuery,
} = require("./hotspot.service");
const {
  resolveAdministrativeArea,
} = require("./administrative-geography.service");
const { resolveWardAndZone } = require("./ward.resolver");

async function analyzeSpatialArea(req, res, next) {
  try {
    const validation = spatialAnalyzeSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid spatial analysis request",
          details: validation.error.issues,
        },
      });
    }

    const result = await analyzeNearbyComplaints(validation.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function detectHotspots(req, res, next) {
  try {
    const validation = detectHotspotsSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid hotspot detection parameters",
          details: validation.error.issues,
        },
      });
    }

    const result = await detectAndPersistHotspots(validation.data);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getHotspots(req, res, next) {
  try {
    const result = await listSavedHotspots({
      city: req.query.city,
      ward: req.query.ward,
      overlapOnly: String(req.query.overlapOnly || "").toLowerCase() === "true",
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getWardAnalyticsController(req, res, next) {
  try {
    const rawWindow = req.query.timeWindowDays
      ? Number(req.query.timeWindowDays)
      : null;

    const result = await getWardAnalytics({
      city: req.query.city || null,
      timeWindowDays:
        Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : null,
      category: req.query.category || null,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getActiveCitiesController(req, res, next) {
  try {
    const result = await listActiveCities();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function geocodePlaceController(req, res, next) {
  try {
    const q = String(req.query.q || req.query.query || "").trim();
    const result = await geocodePlaceQuery(q);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeSpatialArea,
  detectHotspots,
  getHotspots,
  getWardAnalytics: getWardAnalyticsController,
  getActiveCities: getActiveCitiesController,
  geocodePlace: geocodePlaceController,
  resolveAdministrativeGeography: resolveAdministrativeGeographyController,
};

/**
 * GET /api/v1/spatial/resolve?lat=...&lng=...
 *
 * Resolves a coordinate pair against the active administrative boundary dataset
 * (PostGIS point-in-polygon for GCC Chennai). Falls back to the ward resolver
 * centroid lookup for other cities. Returns null fields when the coordinate
 * falls outside any supported coverage area.
 */
async function resolveAdministrativeGeographyController(req, res, next) {
  try {
    const lat = Number(req.query.lat ?? req.query.latitude);
    const lng = Number(req.query.lng ?? req.query.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COORDINATES",
          message: "Query parameters lat and lng must be valid finite numbers",
        },
      });
    }

    // 1. Try PostGIS boundary resolution (GCC Chennai + any other imported dataset)
    const postgisResult = await resolveAdministrativeArea({ latitude: lat, longitude: lng });

    if (postgisResult) {
      return res.status(200).json({
        success: true,
        data: {
          resolved: true,
          method: "POSTGIS_POINT_IN_POLYGON",
          city: postgisResult.city,
          ward: postgisResult.ward,
          zone: postgisResult.zone,
          wardId: postgisResult.wardId,
          zoneId: postgisResult.zoneId,
          municipalityId: postgisResult.municipalityId,
          boundaryVersionId: postgisResult.boundaryVersionId,
        },
      });
    }

    // 2. Fall back to centroid-proximity ward resolver
    const fallback = resolveWardAndZone({ latitude: lat, longitude: lng });

    // If the fallback returned the generic sentinel values it was not a real match
    const isUnresolved =
      !fallback ||
      fallback.ward === "Unassigned Ward" ||
      fallback.city === "General Jurisdiction";

    if (isUnresolved) {
      return res.status(200).json({
        success: true,
        data: {
          resolved: false,
          method: "NONE",
          city: null,
          ward: null,
          zone: null,
          wardId: null,
          zoneId: null,
          municipalityId: null,
          boundaryVersionId: null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        resolved: true,
        method: "CENTROID_PROXIMITY",
        city: fallback.city,
        ward: fallback.ward,
        zone: fallback.zone,
        wardId: null,
        zoneId: null,
        municipalityId: null,
        boundaryVersionId: null,
      },
    });
  } catch (error) {
    next(error);
  }
}
