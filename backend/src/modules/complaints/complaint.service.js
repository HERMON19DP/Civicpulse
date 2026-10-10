const complaintRepository = require("./complaint.repository");
const { canReadComplaint } = require("./complaint.policy");
const { canTransition } = require("./complaint.workflow");

const GeminiEmbeddingProvider = require("../intelligence/understand/gemini.embedding");
const {
  saveEmbedding,
} = require("../../repositories/complaint-embedding.repository");

const pool = require("../../config/database");

const embeddingProvider = new GeminiEmbeddingProvider();

async function createComplaint({
  citizenId,
  title,
  description,
  category,
  address,
  latitude,
  longitude,
}) {
  // Generate the embedding before opening the database transaction.
  const embedding = await embeddingProvider.generateEmbedding(description);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const complaint = await complaintRepository.createComplaint({
      citizenId,
      title,
      description,
      category,
      address,
      latitude,
      longitude,
      db: client,
    });

    await saveEmbedding({
      complaintId: complaint.id,
      embedding,
      modelName: "gemini-embedding-2",
      modelVersion: "current",
      db: client,
    });

    await client.query("COMMIT");

    return complaint;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getComplaintById(id, user) {
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

  return complaint;
}

async function getMyComplaints(citizenId) {
  return complaintRepository.findComplaintsByCitizenId(citizenId);
}

async function getAllComplaints(filters) {
  return complaintRepository.findAllComplaints(filters);
}

async function updateComplaintStatus(id, newStatus) {
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

  return complaintRepository.updateComplaintStatus(id, newStatus);
}

module.exports = {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
  getAllComplaints,
};
