const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const PERMISSIONS = require("../../../domain/permissions");

const {
  analyzeSpatialArea,
  detectHotspots,
  getHotspots,
  getWardAnalytics,
  getActiveCities,
  geocodePlace,
  resolveAdministrativeGeography,
} = require("./spatial.controller");
const { analyzeClusters } = require("./clustering.controller");

const router = express.Router();

router.get("/cities", authenticate, getActiveCities);

router.get("/geocode", authenticate, geocodePlace);

router.get("/resolve", authenticate, resolveAdministrativeGeography);

router.post(
  "/analyze",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  analyzeSpatialArea,
);

router.post(
  "/clusters",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  analyzeClusters,
);

router.get(
  "/hotspots",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  getHotspots,
);

router.post(
  "/hotspots/detect",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  detectHotspots,
);

router.get(
  "/wards",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  getWardAnalytics,
);

module.exports = router;
