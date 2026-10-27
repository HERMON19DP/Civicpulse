const { findClusters } = require("./clustering.repository");

async function clusterComplaints(options) {
  const rows = await findClusters(options);

  const clustersById = new Map();

  for (const row of rows) {
    let cluster = clustersById.get(row.cluster_id);

    if (!cluster) {
      cluster = {
        clusterId: row.cluster_id,
        complaints: [],
        categoryCounts: {},
        latitudeTotal: 0,
        longitudeTotal: 0,
      };

      clustersById.set(row.cluster_id, cluster);
    }

    const complaint = {
      id: row.id,
      referenceId: row.reference_id,
      title: row.title,
      description: row.description,
      category: row.category,
      canonicalCategory: row.canonical_category,
      status: row.status,
      priority: row.priority,
      address: row.address,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: Number(row.distance_meters),
      createdAt: row.created_at,
    };

    cluster.complaints.push(complaint);

    cluster.categoryCounts[complaint.canonicalCategory] =
      (cluster.categoryCounts[complaint.canonicalCategory] || 0) + 1;

    cluster.latitudeTotal += complaint.latitude;
    cluster.longitudeTotal += complaint.longitude;
  }

  const allClusters = Array.from(clustersById.values());

  const clusters = allClusters
    .filter((cluster) => cluster.complaints.length >= options.minClusterSize)
    .map((cluster) => {
      const complaintCount = cluster.complaints.length;

      return {
        clusterId: cluster.clusterId,
        complaintCount,
        centroid: {
          latitude: cluster.latitudeTotal / complaintCount,
          longitude: cluster.longitudeTotal / complaintCount,
        },
        categoryCounts: cluster.categoryCounts,
        complaints: cluster.complaints,
      };
    })
    .sort((a, b) => b.complaintCount - a.complaintCount);

  return {
    center: {
      latitude: options.latitude,
      longitude: options.longitude,
    },
    radiusMeters: options.radiusMeters,
    clusterDistanceMeters: options.clusterDistanceMeters,
    minClusterSize: options.minClusterSize,
    totalComplaintsAnalyzed: rows.length,
    clusterCount: clusters.length,
    clusteredComplaintCount: clusters.reduce(
      (total, cluster) => total + cluster.complaintCount,
      0,
    ),
    excludedComplaintCount:
      rows.length -
      clusters.reduce((total, cluster) => total + cluster.complaintCount, 0),
    clusters,
  };
}

module.exports = {
  clusterComplaints,
};
