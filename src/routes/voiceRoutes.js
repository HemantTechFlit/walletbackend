const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const { createVoiceTransactionDraft } = require("../controllers/voiceController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.post("/transaction-draft", createVoiceTransactionDraft);

module.exports = router;
