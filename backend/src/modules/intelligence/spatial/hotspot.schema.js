const { z } = require("zod");

const detectHotspotsSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(100).max(50000).default(50000),
  clusterDistanceMeters: z.number().int().min(10).max(1000).default(150),
  minClusterSize: z.number().int().min(2).max(100).default(2),
  category: z.string().trim().min(1).max(50).optional(),
  timeWindowDays: z.number().int().min(1).max(3650).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  ward: z.string().trim().min(1).max(100).optional(),
  cityWide: z.boolean().optional().default(true),
});

module.exports = {
  detectHotspotsSchema,
};
