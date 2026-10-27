const { z } = require("zod");

const spatialAnalyzeSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(50000).default(2000),
  maxResults: z.number().int().min(1).max(500).default(100),
  category: z.string().trim().min(1).max(50).optional(),
});

module.exports = {
  spatialAnalyzeSchema,
};
