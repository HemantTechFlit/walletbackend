const express = require("express");

const {
  handleCheckoutSuccess,
  handleCheckoutCancel,
} = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/success", handleCheckoutSuccess);
router.get("/cancel", handleCheckoutCancel);

module.exports = router;
