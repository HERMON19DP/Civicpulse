const complaintRepository = require("./complaint.repository");
const {
  canReadComplaint,
  canModifyComplaintEvidence,
} = require("./complaint.policy");
const { canTransition } = require("./complaint.workflow");
const {
  getFileCategory,
  getPublicFileUrl,
  removeStoredFile,
} = require("../../config/storage");

const evidenceRepository = require("../../repositories/complaint-evidence.repository");
const complaintHistoryRepository = require("../../repositories/complaint-history.repository");
const userRepository = require("../users/user.repository");
const {
  getDepartmentForCategory,
  normalizeCategory,
} = require("../intelligence/understand/classification.service");
const {
  resolveWardAndZone,
  getCityHubByName,
} = require("../intelligence/spatial/ward.resolver");
const {
  resolveAdministrativeArea,
} = require("../intelligence/spatial/administrative-geography.service");
const {
  enqueueComplaintEnrichment,
} = require("../../jobs/complaint-enrichment.job");
const infrastructureService = require("../intelligence/infrastructure/infrastructure.service");
const graphBuilder = require("../intelligence/graph/graph-builder.service");

const pool = require("../../config/database");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertValidUuid(id, label = "Complaint") {
  if (!id || !UUID_REGEX.test(id)) {
    const error = new Error(`${label} not found`);
    error.statusCode = 404;
    error.code = `${label.toUpperCase()}_NOT_FOUND`;
    throw error;
  }
}

async function attachEvidenceToComplaints(complaints) {
  if (!complaints || complaints.length === 0) {
    return [];
  }

  const evidenceMap = await evidenceRepository.findEvidenceByComplaintIds(
    complaints.map((c) => c.id),
  );

  return complaints.map((complaint) => ({
    ...complaint,
    evidence: evidenceMap.get(complaint.id) || [],
  }));
}

async function attachFullDetails(complaint) {
  const [evidence, timeline] = await Promise.all([
    evidenceRepository.findEvidenceByComplaintId(complaint.id),
    complaintHistoryRepository
      .findHistoryByComplaintId(complaint.id)
      .catch(() => []),
  ]);

  return {
    ...complaint,
    evidence,
    timeline,
  };
}

async function resolveTargetOfficer(officerId) {
  if (officerId === null) {
    return null;
  }

  assertValidUuid(officerId, "Officer");
  const officer = await userRepository.findUserById(officerId);
  if (
    !officer ||
    !["OFFICER", "ADMIN"].includes(String(officer.role).toUpperCase())
  ) {
    const error = new Error(
      "Selected assignee must be a valid officer or admin",
    );
    error.statusCode = 400;
    error.code = "INVALID_ASSIGNEE";
    throw error;
  }

  return officer;
}

async function createComplaint({
  citizenId,
  title,
  description,
  category,
  address,
  latitude,
  longitude,
}) {
  const normalizedCategory = normalizeCategory(category);
  const defaultDepartment = getDepartmentForCategory(normalizedCategory);
  const administrativeArea = await resolveAdministrativeArea({
    latitude,
    longitude,
  });

  const fallbackGeo = administrativeArea
    ? null
    : resolveWardAndZone({ latitude, longitude, address });

  const city = administrativeArea?.city || fallbackGeo?.city || null;
  const ward = administrativeArea?.ward || fallbackGeo?.ward || null;
  const zone = administrativeArea?.zone || fallbackGeo?.zone || null;
  const client = await pool.connect();

  let created;
  try {
    await client.query("BEGIN");

    created = await complaintRepository.createComplaint({
      citizenId,
      title,
      description,
      category,
      department: defaultDepartment,
      city,
      ward,
      zone,
      address,
      latitude,
      longitude,
      db: client,
      administrativeWardId: administrativeArea?.wardId || null,
      administrativeZoneId: administrativeArea?.zoneId || null,
      administrativeBoundaryVersionId:
        administrativeArea?.boundaryVersionId || null,
    });

    await complaintHistoryRepository.recordStatusChange({
      complaintId: created.id,
      fromStatus: null,
      toStatus: created.status || "SUBMITTED",
      actorId: citizenId,
      actorRole: "CITIZEN",
      note: "Complaint submitted by citizen",
      db: client,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (process.env.NODE_ENV !== "test") {
    enqueueComplaintEnrichment(created.id).catch((err) => {
      console.warn(
        `Failed to enqueue enrichment job for ${created.id}:`,
        err.message,
      );
    });
    infrastructureService
      .recalculateInfrastructureHealth({
        city: created.city || city || null,
        skipGraphSync: true,
      })
      .catch(() => {})
      .finally(() => {
        graphBuilder
          .syncKnowledgeGraph({ city: created.city || city || null })
          .catch(() => {});
      });
  }

  return attachFullDetails(created);
}

async function getComplaintById(id, user) {
  assertValidUuid(id, "Complaint");
  const complaint = await complaintRepository.findComplaintById(id);

  if (!complaint) {
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  if (!canReadComplaint(user, complaint)) {
    const error = new Error(
      "You do not have permission to view this complaint",
    );
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  return attachFullDetails(complaint);
}

async function getMyComplaints(citizenId) {
  const complaints =
    await complaintRepository.findComplaintsByCitizenId(citizenId);
  return attachEvidenceToComplaints(complaints);
}

async function getAllComplaints(filters) {
  const complaints = await complaintRepository.findAllComplaints(filters);
  return attachEvidenceToComplaints(complaints);
}

async function getMapComplaints(filters) {
  const complaints = await complaintRepository.findMapComplaints(filters);
  return attachEvidenceToComplaints(complaints);
}

async function getNearbyComplaints({
  latitude,
  longitude,
  radiusMeters = 5000,
  category,
  city,
  limit = 100,
}) {
  const hasLat =
    latitude !== undefined &&
    latitude !== null &&
    String(latitude).trim() !== "" &&
    Number.isFinite(Number(latitude));
  const hasLng =
    longitude !== undefined &&
    longitude !== null &&
    String(longitude).trim() !== "" &&
    Number.isFinite(Number(longitude));

  const cityHub =
    (!hasLat || !hasLng) && city && city !== "all"
      ? getCityHubByName(city)
      : null;

  const lat = hasLat ? Number(latitude) : (cityHub?.latitude ?? 17.4156);
  const lng = hasLng ? Number(longitude) : (cityHub?.longitude ?? 78.4357);
  const radius = Math.min(Math.max(Number(radiusMeters) || 5000, 100), 50000);

  return complaintRepository.findNearbyPublicComplaints({
    latitude: lat,
    longitude: lng,
    radiusMeters: radius,
    category: category && category !== "all" ? category : undefined,
    city: city && city !== "all" ? city : undefined,
    limit,
  });
}

async function getComplaintStats() {
  const raw = await complaintRepository.getComplaintStats();
  return {
    total: raw.total,
    open: raw.pending,
    pending: raw.pending,
    submitted: raw.submitted,
    underReview: raw.under_review,
    assigned: raw.assigned,
    inProgress: raw.in_progress,
    activeInProgress: raw.active_in_progress,
    needsInformation: raw.needs_information,
    duplicateSuspected: raw.duplicate_suspected,
    resolved: raw.resolved,
    resolvedLast30Days: raw.resolved_last_30_days,
    rejected: raw.rejected,
    overdue: raw.overdue,
    createdToday: raw.created_today,
  };
}

async function updateComplaintStatus(
  id,
  newStatus,
  { actor = null, note = "", assignedOfficerId, possibleDuplicateOfId } = {},
) {
  assertValidUuid(id, "Complaint");
  const complaint = await complaintRepository.findComplaintById(id);

  if (!complaint) {
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  if (!canTransition(complaint.status, newStatus)) {
    const error = new Error(
      `Cannot change complaint status from ${complaint.status} to ${newStatus}`,
    );
    error.statusCode = 409;
    error.code = "INVALID_STATUS_TRANSITION";
    throw error;
  }

  let effectiveOfficerId = assignedOfficerId;
  if (effectiveOfficerId !== undefined) {
    await resolveTargetOfficer(effectiveOfficerId);
  } else if (
    newStatus === "ASSIGNED" &&
    !complaint.assigned_officer_id &&
    actor?.id
  ) {
    effectiveOfficerId = actor.id;
  }

  if (possibleDuplicateOfId !== undefined && possibleDuplicateOfId !== null) {
    assertValidUuid(possibleDuplicateOfId, "Complaint");
  }

  const trimmedNote = typeof note === "string" ? note.trim() : "";
  const historyNote =
    trimmedNote || `Status updated from ${complaint.status} to ${newStatus}`;

  const updatePayload = {};
  if (effectiveOfficerId !== undefined) {
    updatePayload.assignedOfficerId = effectiveOfficerId;
  }
  if (possibleDuplicateOfId !== undefined) {
    updatePayload.possibleDuplicateOfId = possibleDuplicateOfId;
  }

  const client = await pool.connect();
  let updated;
  try {
    await client.query("BEGIN");

    updated = await complaintRepository.updateComplaintStatus(
      id,
      newStatus,
      updatePayload,
      client,
    );

    await complaintHistoryRepository.recordStatusChange({
      complaintId: id,
      fromStatus: complaint.status,
      toStatus: newStatus,
      actorId: actor?.id || null,
      actorRole: actor?.role || "OFFICER",
      note: historyNote,
      db: client,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (process.env.NODE_ENV !== "test") {
    infrastructureService
      .recalculateInfrastructureHealth({
        city: updated.city || complaint.city || null,
        skipGraphSync: true,
      })
      .catch(() => {})
      .finally(() => {
        graphBuilder
          .syncKnowledgeGraph({ city: updated.city || complaint.city || null })
          .catch(() => {});
      });
  }

  return attachFullDetails(updated);
}

async function assignComplaint(
  id,
  { assignedOfficerId, actor = null, note = "" } = {},
) {
  assertValidUuid(id, "Complaint");
  const complaint = await complaintRepository.findComplaintById(id);

  if (!complaint) {
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  const officer = await resolveTargetOfficer(assignedOfficerId);
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  const historyNote =
    trimmedNote ||
    (officer
      ? `Assigned to ${officer.name} (${officer.email})`
      : "Officer assignment removed");

  const client = await pool.connect();
  let updated;
  try {
    await client.query("BEGIN");

    updated = await complaintRepository.assignComplaintOfficer(
      id,
      officer ? officer.id : null,
      client,
    );

    await complaintHistoryRepository.recordStatusChange({
      complaintId: id,
      fromStatus: complaint.status,
      toStatus: complaint.status,
      actorId: actor?.id || null,
      actorRole: actor?.role || "OFFICER",
      note: historyNote,
      db: client,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (process.env.NODE_ENV !== "test") {
    infrastructureService
      .recalculateInfrastructureHealth({
        city: updated.city || complaint.city || null,
        skipGraphSync: true,
      })
      .catch(() => {})
      .finally(() => {
        graphBuilder
          .syncKnowledgeGraph({ city: updated.city || complaint.city || null })
          .catch(() => {});
      });
  }

  return attachFullDetails(updated);
}

async function addComplaintEvidence(complaintId, files, user) {
  assertValidUuid(complaintId, "Complaint");
  const complaint = await complaintRepository.findComplaintById(complaintId);

  if (!complaint) {
    for (const file of files || []) {
      removeStoredFile(file.filename);
    }
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  if (!canModifyComplaintEvidence(user, complaint)) {
    for (const file of files || []) {
      removeStoredFile(file.filename);
    }
    const error = new Error(
      "You do not have permission to attach evidence to this complaint",
    );
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  if (!files || files.length === 0) {
    const error = new Error(
      "At least one evidence file is required (field name 'files' or 'file')",
    );
    error.statusCode = 400;
    error.code = "NO_FILES_UPLOADED";
    throw error;
  }

  const records = files.map((file) => ({
    complaintId: complaint.id,
    uploadedBy: user.id,
    originalName: (file.originalname || file.filename).slice(0, 255),
    storageKey: file.filename,
    fileUrl: getPublicFileUrl(file.filename),
    mimeType: file.mimetype,
    fileType: getFileCategory(file.mimetype),
    fileSize: file.size,
  }));

  try {
    return await evidenceRepository.createEvidenceBatch(records);
  } catch (err) {
    for (const file of files) {
      removeStoredFile(file.filename);
    }
    throw err;
  }
}

async function getComplaintEvidence(complaintId, user) {
  assertValidUuid(complaintId, "Complaint");
  const complaint = await complaintRepository.findComplaintById(complaintId);

  if (!complaint) {
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  if (!canReadComplaint(user, complaint)) {
    const error = new Error(
      "You do not have permission to view evidence for this complaint",
    );
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  return evidenceRepository.findEvidenceByComplaintId(complaint.id);
}

async function deleteComplaintEvidence(complaintId, evidenceId, user) {
  assertValidUuid(complaintId, "Complaint");
  assertValidUuid(evidenceId, "Evidence");

  const complaint = await complaintRepository.findComplaintById(complaintId);
  if (!complaint) {
    const error = new Error("Complaint not found");
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  if (!canModifyComplaintEvidence(user, complaint)) {
    const error = new Error(
      "You do not have permission to remove evidence from this complaint",
    );
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  const evidence = await evidenceRepository.findEvidenceById(evidenceId);
  if (!evidence || String(evidence.complaint_id) !== String(complaint.id)) {
    const error = new Error("Evidence record not found");
    error.statusCode = 404;
    error.code = "EVIDENCE_NOT_FOUND";
    throw error;
  }

  const deleted = await evidenceRepository.deleteEvidenceById(evidenceId);
  removeStoredFile(evidence.storage_key);
  return deleted;
}

module.exports = {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
  assignComplaint,
  getAllComplaints,
  getMapComplaints,
  getNearbyComplaints,
  getComplaintStats,
  addComplaintEvidence,
  getComplaintEvidence,
  deleteComplaintEvidence,
};
