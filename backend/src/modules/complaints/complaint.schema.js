const { z } = require("zod");

const createComplaintSchema = z.object({
  title: z.string().trim().min(3).max(200),

  description: z.string().trim().min(10).max(5000),

  category: z.string().trim().min(1).max(50),

  address: z.string().trim().min(1).max(500),

  latitude: z.number().min(-90).max(90),

  longitude: z.number().min(-180).max(180),
});

const updateComplaintStatusSchema = z.object({
  status: z.enum([
    "UNDER_REVIEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "RESOLVED",
    "REJECTED",
    "NEEDS_INFORMATION",
    "DUPLICATE_SUSPECTED",
  ]),
});

module.exports = {
  createComplaintSchema,
  updateComplaintStatusSchema,
};
