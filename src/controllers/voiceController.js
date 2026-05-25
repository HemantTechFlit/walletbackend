const User = require("../models/User");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { generateVoiceTransactionDraft } = require("../utils/voiceTransactionDraft");

const createVoiceTransactionDraft = async (req, res) => {
  try {
    const inputTranscript =
      typeof req.body.transcript === "string" ? req.body.transcript.trim() : "";
    const transcript = inputTranscript;

    if (!transcript) {
      return errorResponse(res, "transcript is required", 400);
    }

    if (transcript.length > 1000) {
      return errorResponse(res, "transcript must be at most 1000 characters", 400);
    }

    if (req.body.timezone && typeof req.body.timezone !== "string") {
      return errorResponse(res, "timezone must be a string", 400);
    }

    const userId = req.user.userId;
    const [user, wallets, categories] = await Promise.all([
      User.findById(userId).select("currency defaultWalletId").lean(),
      Wallet.find({ userId, isDeleted: false }).sort({ createdAt: -1 }).lean(),
      TransactionCategory.find({ userId }).sort({ name: 1 }).lean(),
    ]);

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const draft = await generateVoiceTransactionDraft({
      transcript,
      referenceDate: req.body.referenceDate,
      timezone: req.body.timezone?.trim() || null,
      user,
      wallets,
      categories: categories.filter((category) => !category.isDeleted),
      unavailableCategories: categories.filter((category) => category.isDeleted),
    });

    return successResponse(
      res,
      "Voice transaction draft generated successfully",
      draft,
    );
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  createVoiceTransactionDraft,
};
