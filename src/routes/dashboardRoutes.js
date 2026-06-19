const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const { getDashboard } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/", authMiddleware, requireOnboarding, getDashboard);

module.exports = router;
