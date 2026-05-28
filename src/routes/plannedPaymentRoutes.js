const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  createPlannedPayment,
  listPlannedPaymentOccurrences,
  listPlannedPaymentDecisions,
  decidePlannedPaymentOccurrence,
} = require("../controllers/plannedPaymentController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.post("/", createPlannedPayment);
router.get("/occurrences", listPlannedPaymentOccurrences);
router.get("/occurrences/decisions", listPlannedPaymentDecisions);
router.post("/:id/occurrences/decision", decidePlannedPaymentOccurrence);

module.exports = router;
