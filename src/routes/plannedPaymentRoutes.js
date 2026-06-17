const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listPlannedPayments,
  createPlannedPayment,
  updatePlannedPayment,
  deletePlannedPayment,
  deletePlannedPaymentOccurrence,
  listUpcomingPlannedPayments,
  listPlannedPaymentOccurrences,
  listPlannedPaymentDecisions,
  decidePlannedPaymentOccurrence,
} = require("../controllers/plannedPaymentController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listPlannedPayments);
router.post("/", createPlannedPayment);
router.get("/upcoming", listUpcomingPlannedPayments);
router.get("/occurrences", listPlannedPaymentOccurrences);
router.get("/occurrences/decisions", listPlannedPaymentDecisions);
router.delete("/:id/occurrences", deletePlannedPaymentOccurrence);
router.post("/:id/occurrences/decision", decidePlannedPaymentOccurrence);
router.patch("/:id", updatePlannedPayment);
router.delete("/:id", deletePlannedPayment);

module.exports = router;
