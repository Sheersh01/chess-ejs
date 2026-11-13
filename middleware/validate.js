const { validationResult } = require("express-validator");

// API: JSON 400 with the full error list.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Web forms: re-render `view` with the first error and the safe fields echoed back.
const validateForm =
  (view, echoFields = [], extraLocals = () => ({})) =>
  (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const locals = { ...extraLocals(req), error: errors.array()[0].msg };
    for (const field of echoFields) {
      locals[field] = typeof req.body[field] === "string" ? req.body[field] : "";
    }
    return res.status(400).render(view, locals);
  };

module.exports = validate;
module.exports.validate = validate;
module.exports.validateForm = validateForm;
