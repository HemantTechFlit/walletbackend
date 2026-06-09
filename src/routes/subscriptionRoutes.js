const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const {
  getMySubscription,
  createStripeCheckout,
  confirmCheckoutSession,
  changePlan,
  cancelMySubscription,
  reactivateMySubscription,
} = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/", authMiddleware, getMySubscription);
router.get("/checkout/success", authMiddleware, confirmCheckoutSession);
router.post("/checkout/confirm", authMiddleware, confirmCheckoutSession);
router.post("/checkout", authMiddleware, createStripeCheckout);
router.post("/change-plan", authMiddleware, changePlan);
router.post("/cancel", authMiddleware, cancelMySubscription);
router.post("/reactivate", authMiddleware, reactivateMySubscription);

module.exports = router;
