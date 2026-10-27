const { spatialAnalyzeSchema } = require("./spatial.schema");
const { analyzeNearbyComplaints } = require("./spatial.service");

async function analyzeSpatialArea(req, res, next) {
  try {
    const validation = spatialAnalyzeSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid spatial analysis request",
          details: validation.error.issues,
        },
      });
    }

    const result = await analyzeNearbyComplaints(validation.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeSpatialArea,
};
