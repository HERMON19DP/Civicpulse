const { findComplaintById } = require("./complaint.repository");

const {
  createUpvote,
  countUpvotes,
} = require("../../repositories/complaint-upvote.repository");

async function upvoteComplaint({ complaintId, userId }) {
  const complaint = await findComplaintById(complaintId);

  if (!complaint) {
    return null;
  }

  // Citizens cannot upvote their own complaints.
  if (String(complaint.citizen_id) === String(userId)) {
    const error = new Error("You cannot upvote your own complaint");
    error.statusCode = 403;
    error.code = "CANNOT_UPVOTE_OWN_COMPLAINT";
    throw error;
  }

  const upvote = await createUpvote({
    complaintId,
    userId,
  });

  const upvoteCount = await countUpvotes(complaintId);

  return {
    created: upvote !== null,
    upvoteCount,
  };
}

module.exports = {
  upvoteComplaint,
};
