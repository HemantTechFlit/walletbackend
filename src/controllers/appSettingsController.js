const { getAppSettingsJson } = require("../config/appSettings");

const getAppSettings = async (req, res) => {
  try {
    return res.status(200).json({
      appJson: getAppSettingsJson(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAppSettings,
};
