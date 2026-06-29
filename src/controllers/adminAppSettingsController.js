const {
  getAppSettingsJson,
  updateAppSettingsJson,
  validateAppSettingsPayload,
} = require("../services/appSettingsService");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const getAdminAppSettings = async (req, res) => {
  try {
    const appJson = await getAppSettingsJson();

    return successResponse(res, "App settings fetched successfully", {
      appJson,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const updateAdminAppSettings = async (req, res) => {
  try {
    const { appJson } = req.body;
    const validationError = validateAppSettingsPayload(appJson, {
      requireFullAdsConfig: Boolean(appJson?.adsConfig),
      requireFullAppConfig: Boolean(appJson?.appConfig),
    });

    if (validationError) {
      return errorResponse(res, validationError, 400);
    }

    const updatedAppJson = await updateAppSettingsJson(appJson, {
      replaceSections: true,
    });

    return successResponse(res, "App settings updated successfully", {
      appJson: updatedAppJson,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  getAdminAppSettings,
  updateAdminAppSettings,
};
