const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const { getMySubscription, subscribe } = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/", authMiddleware, getMySubscription);
router.post("/", authMiddleware, subscribe);

module.exports = router;
