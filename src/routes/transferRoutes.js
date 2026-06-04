const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const optionalReceiptUpload = require("../middlewares/optionalReceiptUpload");
const { listTransfers, createTransfer } = require("../controllers/transferController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listTransfers);
router.post("/", optionalReceiptUpload, createTransfer);

module.exports = router;
