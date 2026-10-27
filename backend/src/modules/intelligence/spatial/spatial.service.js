const spatialRepository = require("./spatial.repository");

async function analyzeNearbyComplaints({
  latitude,
  longitude,
  radiusMeters = 2000,
  maxResults = 100,
  category,
}) {
  const complaints = await spatialRepository.findNearbyComplaints({
    latitude,
    longitude,
    radiusMeters,
    maxResults,
    category,
  });

  const categoryCounts = {};

  for (const complaint of complaints) {
    const key = complaint.canonical_category || "UNCATEGORIZED";
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  }

  return {
    center: {
      latitude,
      longitude,
    },
    radiusMeters,
    returnedCount: complaints.length,
    maxResults,
    categoryCounts,
    complaints: complaints.map((complaint) => ({
      id: complaint.id,
      referenceId: complaint.reference_id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      canonicalCategory: complaint.canonical_category,
      status: complaint.status,
      priority: complaint.priority,
      address: complaint.address,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      distanceMeters: Number(complaint.distance_meters),
      createdAt: complaint.created_at,
    })),
  };
}

module.exports = {
  analyzeNearbyComplaints,
};
