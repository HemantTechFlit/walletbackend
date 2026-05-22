const mongoose = require("mongoose");

const WalletTransfer = require("../models/WalletTransfer");
const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertSufficientWalletBalance } = require("../utils/walletBalance");

const TRANSFER_CATEGORY_NAME = "Wallet transfer";

const getOrCreateTransferCategory = async (userId, session) => {
  let category = await TransactionCategory.findOne({
    userId,
    name: TRANSFER_CATEGORY_NAME,
    isDeleted: false,
  }).session(session);

  if (!category) {
    const created = await TransactionCategory.create(
      [
        {
          userId,
          name: TRANSFER_CATEGORY_NAME,
          isDefault: false,
        },
      ],
      { session },
    );
    category = created[0];
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { selectedCategories: category._id } },
      { session },
    );
  }

  return category;
};

const assertOwnWallet = (userId, walletId, session) =>
  Wallet.findOne({ _id: walletId, userId, isDeleted: false }).session(session);

const listTransfers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { userId: req.user.userId };

    const [items, total] = await Promise.all([
      WalletTransfer.find(filter)
        .sort({ transferDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("fromWalletId", "walletName")
        .populate("toWalletId", "walletName")
        .lean(),
      WalletTransfer.countDocuments(filter),
    ]);

    return successResponse(res, "Transfers fetched successfully", {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createTransfer = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.userId;
    const { fromWalletId, toWalletId, amount, title, description, transferDate } =
      req.body;

    if (!fromWalletId || !toWalletId) {
      return errorResponse(res, "fromWalletId and toWalletId are required", 400);
    }
    if (!mongoose.isValidObjectId(fromWalletId) || !mongoose.isValidObjectId(toWalletId)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }
    if (fromWalletId === toWalletId) {
      return errorResponse(res, "Cannot transfer to the same wallet", 400);
    }
    if (amount === undefined || Number(amount) <= 0 || Number.isNaN(Number(amount))) {
      return errorResponse(res, "amount must be a positive number", 400);
    }

    session.startTransaction();

    const fromWallet = await assertOwnWallet(userId, fromWalletId, session);
    const toWallet = await assertOwnWallet(userId, toWalletId, session);

    if (!fromWallet || !toWallet) {
      await session.abortTransaction();
      return errorResponse(res, "Wallet not found", 404);
    }

    const category = await getOrCreateTransferCategory(userId, session);

    const when = transferDate ? new Date(transferDate) : new Date();
    if (Number.isNaN(when.getTime())) {
      await session.abortTransaction();
      return errorResponse(res, "Invalid transferDate", 400);
    }

    const amt = Number(amount);

    try {
      await assertSufficientWalletBalance(userId, fromWalletId, amt);
    } catch (error) {
      await session.abortTransaction();
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    const [debitTx, creditTx, transfer] = await Promise.all([
      WalletTransaction.create(
        [
          {
            userId,
            walletId: fromWalletId,
            categoryId: category._id,
            type: "EXPENSE",
            amount: amt,
            title: title?.trim() || "Wallet transfer",
            description: description ?? null,
            transactionDate: when,
            categorySnapshot: { name: category.name },
            walletSnapshot: { walletName: fromWallet.walletName },
            createdBy: userId,
          },
        ],
        { session },
      ),
      WalletTransaction.create(
        [
          {
            userId,
            walletId: toWalletId,
            categoryId: category._id,
            type: "INCOME",
            amount: amt,
            title: title?.trim() || "Wallet transfer",
            description: description ?? null,
            transactionDate: when,
            categorySnapshot: { name: category.name },
            walletSnapshot: { walletName: toWallet.walletName },
            createdBy: userId,
          },
        ],
        { session },
      ),
      WalletTransfer.create(
        [
          {
            userId,
            fromWalletId,
            toWalletId,
            amount: amt,
            title: title?.trim() || "Wallet transfer",
            description: description ?? null,
            transferDate: when,
            status: "SUCCESS",
          },
        ],
        { session },
      ),
    ]);

    const transferDoc = transfer[0];
    transferDoc.debitTransactionId = debitTx[0]._id;
    transferDoc.creditTransactionId = creditTx[0]._id;
    await transferDoc.save({ session });

    await session.commitTransaction();

    const populated = await WalletTransfer.findById(transferDoc._id)
      .populate("fromWalletId", "walletName")
      .populate("toWalletId", "walletName");

    return successResponse(res, "Transfer completed successfully", populated, 201);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

module.exports = {
  listTransfers,
  createTransfer,
};
