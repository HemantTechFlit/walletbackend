const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const { listTransfers, createTransfer } = require("../controllers/transferController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listTransfers);
router.post("/", createTransfer);

module.exports = router;
