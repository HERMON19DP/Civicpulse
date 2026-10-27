const { spatialClusteringSchema } = require("./clustering.schema");
const { clusterComplaints } = require("./clustering.service");

async function analyzeClusters(req, res, next) {
  try {
    const validation = spatialClusteringSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid spatial clustering parameters",
          details: validation.error.issues,
        },
      });
    }

    const result = await clusterComplaints(validation.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeClusters,
};
