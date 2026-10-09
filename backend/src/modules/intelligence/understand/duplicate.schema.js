const Joi = require("joi");

const duplicateCheckSchema = Joi.object({
  description: Joi.string().trim().min(5).max(5000).required(),

  category: Joi.string().trim().max(100).optional().allow(null, ""),

  latitude: Joi.number().min(-90).max(90).required(),

  longitude: Joi.number().min(-180).max(180).required(),
}).custom((value, helpers) => {
  const hasLatitude = value.latitude != null;
  const hasLongitude = value.longitude != null;

  if (hasLatitude !== hasLongitude) {
    return helpers.error("any.invalid");
  }

  return value;
}, "coordinate pair validation");

module.exports = {
  duplicateCheckSchema,
};
