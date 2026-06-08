const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  createPlannedPayment,
  updatePlannedPayment,
  deletePlannedPayment,
  deletePlannedPaymentOccurrence,
  listPlannedPaymentOccurrences,
  listPlannedPaymentDecisions,
  decidePlannedPaymentOccurrence,
} = require("../controllers/plannedPaymentController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.post("/", createPlannedPayment);
router.get("/occurrences", listPlannedPaymentOccurrences);
router.get("/occurrences/decisions", listPlannedPaymentDecisions);
router.delete("/:id/occurrences", deletePlannedPaymentOccurrence);
router.post("/:id/occurrences/decision", decidePlannedPaymentOccurrence);
router.patch("/:id", updatePlannedPayment);
router.delete("/:id", deletePlannedPayment);

module.exports = router;
