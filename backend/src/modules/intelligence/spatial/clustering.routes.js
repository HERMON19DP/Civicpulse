const express = require("express");
const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const PERMISSIONS = require("../../../domain/permissions");
const { analyzeClusters } = require("./clustering.controller");

const router = express.Router();

router.post(
  "/clusters",
  authenticate,
  authorize(PERMISSIONS.SPATIAL_ANALYZE),
  analyzeClusters,
);

module.exports = router;
