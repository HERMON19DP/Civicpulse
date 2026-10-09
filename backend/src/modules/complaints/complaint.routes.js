const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const validate = require("../../middleware/validate");

const PERMISSIONS = require("../../domain/permissions");
const authorizeAny = require("../../middleware/authorizeAny");

const {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
} = require("./complaint.controller");

const {
  createComplaintSchema,
  updateComplaintStatusSchema,
} = require("./complaint.schema");

const { upvote } = require("./upvote.controller");

const router = express.Router();

router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_CREATE),
  validate(createComplaintSchema),
  createComplaint,
);

router.post("/:complaintId/upvote", authenticate, upvote);

router.get("/mine", authenticate, getMyComplaints);

router.get(
  "/:id",
  authenticate,
  authorizeAny(
    PERMISSIONS.COMPLAINT_READ_OWN,
    PERMISSIONS.COMPLAINT_READ_DEPARTMENT,
  ),
  getComplaintById,
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_UPDATE_STATUS),
  validate(updateComplaintStatusSchema),
  updateComplaintStatus,
);

module.exports = router;
