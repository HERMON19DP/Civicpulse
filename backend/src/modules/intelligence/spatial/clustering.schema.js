const { z } = require("zod");

const spatialClusteringSchema = z.object({
  latitude: z.number().min(-90).max(90),

  longitude: z.number().min(-180).max(180),

  // Geographic area to analyze
  radiusMeters: z.number().int().min(100).max(50000).default(5000),

  // Maximum distance between directly connected complaints
  clusterDistanceMeters: z.number().int().min(10).max(1000).default(100),

  // Exclude isolated complaints from the cluster output
  minClusterSize: z.number().int().min(2).max(100).default(2),

  // Optional filter; ROAD and ROADS will be normalized
  category: z.string().trim().min(1).max(50).optional(),
});

module.exports = {
  spatialClusteringSchema,
};
