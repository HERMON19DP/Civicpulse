const express = require("express");

const router = express.Router();

const userRoutes = require("../modules/users/user.routes");
const authRoutes = require("../modules/auth/auth.routes");
const complaintRoutes = require("../modules/complaints/complaint.routes");
const duplicateRoutes = require("../modules/intelligence/understand/duplicate.routes");
const spatialRoutes = require("../modules/intelligence/spatial/spatial.routes");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/complaints", complaintRoutes);
router.use("/intelligence", duplicateRoutes);
router.use("/spatial", spatialRoutes);

module.exports = router;
