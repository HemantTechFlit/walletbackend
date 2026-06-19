const express = require("express");

const {
  getAppSettings,
  updateAppSettings,
} = require("../controllers/appSettingsController");
const appSettingsApiKeyMiddleware = require("../middlewares/appSettingsApiKeyMiddleware");

const router = express.Router();

router.get("/", getAppSettings);
router.put("/", appSettingsApiKeyMiddleware, updateAppSettings);

module.exports = router;
