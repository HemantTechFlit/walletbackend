const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listReports,
  createReport,
  downloadReport,
} = require("../controllers/reportController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listReports);
router.post("/", createReport);
router.get("/:id/download", downloadReport);

module.exports = router;
