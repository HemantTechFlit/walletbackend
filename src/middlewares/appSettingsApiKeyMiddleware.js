const { errorResponse } = require("../utils/responseHandler");

const appSettingsApiKeyMiddleware = (req, res, next) => {
  const configuredKey = process.env.APP_SETTINGS_API_KEY?.trim();

  if (!configuredKey) {
    return errorResponse(res, "App settings update is not configured", 503);
  }

  const providedKey = req.headers["x-api-key"]?.trim();

  if (!providedKey || providedKey !== configuredKey) {
    return errorResponse(res, "Unauthorized", 401);
  }

  return next();
};

module.exports = appSettingsApiKeyMiddleware;
