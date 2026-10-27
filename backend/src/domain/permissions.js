const PERMISSIONS = {
  COMPLAINT_CREATE: "complaint:create",
  COMPLAINT_READ_OWN: "complaint:read:own",
  COMPLAINT_READ_DEPARTMENT: "complaint:read:department",
  COMPLAINT_UPDATE_STATUS: "complaint:update_status",

  OFFICER_MANAGE: "officer:manage",
  USER_MANAGE: "user:manage",

  COPILOT_QUERY: "copilot:query",
  RECOMMENDATION_DECIDE: "recommendation:decide",
  AUDIT_READ: "audit:read",

  SPATIAL_ANALYZE: "spatial:analyze",
};

module.exports = PERMISSIONS;
