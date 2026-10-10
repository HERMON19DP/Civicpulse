const complaintService = require("./complaint.service");

function toComplaintResponse(complaint) {
  return {
    id: complaint.id,
    referenceId: complaint.reference_id,
    title: complaint.title,
    description: complaint.description,
    category: complaint.category,
    address: complaint.address,
    status: complaint.status,
    priority: complaint.priority,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    createdAt: complaint.created_at,
    updatedAt: complaint.updated_at,
  };
}

async function createComplaint(req, res, next) {
  try {
    const complaint = await complaintService.createComplaint({
      citizenId: req.user.id,
      ...req.body,
    });

    return res.status(201).json({
      data: toComplaintResponse(complaint),
    });
  } catch (error) {
    next(error);
  }
}

async function getComplaintById(req, res, next) {
  try {
    const complaint = await complaintService.getComplaintById(
      req.params.id,
      req.user,
    );

    return res.status(200).json({
      data: toComplaintResponse(complaint),
    });
  } catch (error) {
    next(error);
  }
}

async function getMyComplaints(req, res, next) {
  try {
    const complaints = await complaintService.getMyComplaints(req.user.id);

    return res.status(200).json({
      data: complaints.map(toComplaintResponse),
    });
  } catch (error) {
    next(error);
  }
}

async function getAllComplaints(req, res, next) {
  try {
    const complaints = await complaintService.getAllComplaints({
      status: req.query.status,
      category: req.query.category,
      query: req.query.query,
    });

    return res.status(200).json({
      data: complaints.map(toComplaintResponse),
    });
  } catch (error) {
    next(error);
  }
}

async function updateComplaintStatus(req, res, next) {
  try {
    const complaint = await complaintService.updateComplaintStatus(
      req.params.id,
      req.body.status,
    );

    return res.status(200).json({
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
  getAllComplaints,
};
