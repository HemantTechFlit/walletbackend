const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const { optionalSupportImageUpload } = require("../middlewares/optionalSupportImageUpload");
const {
  submitHelpCenter,
  submitBugReport,
  submitFeatureRequest,
} = require("../controllers/supportController");

const router = express.Router();

router.use(authMiddleware);

router.post("/help-center", submitHelpCenter);
router.post("/report-bug", optionalSupportImageUpload, submitBugReport);
router.post("/request-feature", optionalSupportImageUpload, submitFeatureRequest);

module.exports = router;
