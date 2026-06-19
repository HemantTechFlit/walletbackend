const {
  getAppSettingsJson,
  updateAppSettingsJson,
  validateAppSettingsPayload,
} = require("../services/appSettingsService");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const getAppSettings = async (req, res) => {
  try {
    const appJson = await getAppSettingsJson();

    return res.status(200).json({
      appJson,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const updateAppSettings = async (req, res) => {
  try {
    const { appJson } = req.body;
    const validationError = validateAppSettingsPayload(appJson);

    if (validationError) {
      return errorResponse(res, validationError, 400);
    }

    const updatedAppJson = await updateAppSettingsJson(appJson);

    return successResponse(res, "App settings updated successfully", {
      appJson: updatedAppJson,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  getAppSettings,
  updateAppSettings,
};
