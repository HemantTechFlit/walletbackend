const express = require("express");

const { getAppSettings } = require("../controllers/appSettingsController");

const router = express.Router();

router.get("/", getAppSettings);

module.exports = router;
