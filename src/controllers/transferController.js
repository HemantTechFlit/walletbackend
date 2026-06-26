const mongoose = require("mongoose");

const WalletTransfer = require("../models/WalletTransfer");
const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const {
  assertCanUploadReceipt,
  getReplacingReceiptBytes,
  deleteReceiptAttachmentsForTransactions,
  createReceiptAttachment,
} = require("../utils/receiptUpload");
const {
  aggregateBalancesByWalletIds,
} = require("../utils/walletBalance");
const { resolveConversionAmounts } = require("../utils/currencyConversion");

const resolveTransferAmounts = async ({
  amount,
  fromWallet,
  toWallet,
  amountIn,
}) => {
  const fromCurrency = fromWallet.currency;
  const toCurrency = toWallet.currency;

  if (fromCurrency === toCurrency) {
    const parsedAmount = Number(amount);
    return {
      fromAmount: parsedAmount,
      toAmount: parsedAmount,
      fromCurrency,
      toCurrency,
      exchangeRate: 1,
      rateUpdatedAt: null,
    };
  }

  const conversion = await resolveConversionAmounts({
    amount,
    fromCurrency,
    toCurrency,
    amountIn: amountIn || "from",
  });

  return {
    fromAmount: conversion.fromAmount,
    toAmount: conversion.toAmount,
    fromCurrency: conversion.fromCurrency,
    toCurrency: conversion.toCurrency,
    exchangeRate: conversion.exchangeRate,
    rateUpdatedAt: conversion.rateUpdatedAt,
  };
};

const assertOwnWallet = (userId, walletId, session) =>
  Wallet.findOne({ _id: walletId, userId, isDeleted: false }).session(session);

const UNKNOWN_WALLET = {
  _id: null,
  walletName: "Unknown wallet",
  currency: null,
};

const normalizeTransferWallets = (transfer) => {
  const normalized = { ...transfer };

  if (!normalized.fromWalletId) {
    normalized.fromWalletId = UNKNOWN_WALLET;
  }

  if (!normalized.toWalletId) {
    normalized.toWalletId = UNKNOWN_WALLET;
  }

  return normalized;
};

const listTransfers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { userId };

    const items = await WalletTransfer.find(filter)
      .sort({ transferDate: -1, createdAt: -1 })
      .populate("fromWalletId", "walletName currency")
      .populate("toWalletId", "walletName currency")
      .lean();

    const linkedTransactionIds = items.flatMap((transfer) =>
      [transfer.debitTransactionId, transfer.creditTransactionId].filter(Boolean),
    );

    const activeTransactionIds = new Set(
      (
        await WalletTransaction.find({
          userId,
          isDeleted: false,
          _id: { $in: linkedTransactionIds },
        })
          .select("_id")
          .lean()
      ).map((transaction) => transaction._id.toString()),
    );

    const visibleTransfers = items.filter((transfer) => {
      const debitId = transfer.debitTransactionId?.toString();
      const creditId = transfer.creditTransactionId?.toString();
      return (
        (debitId && activeTransactionIds.has(debitId)) ||
        (creditId && activeTransactionIds.has(creditId))
      );
    });

    const total = visibleTransfers.length;
    const paginatedTransfers = visibleTransfers.slice(skip, skip + limit);

    return successResponse(res, "Transfers fetched successfully", {
      items: paginatedTransfers.map(normalizeTransferWallets),
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
    const {
      fromWalletId,
      toWalletId,
      amount,
      title,
      description,
      transferDate,
      amountIn,
    } = req.body;

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

    if (req.file) {
      try {
        await assertCanUploadReceipt(userId, req.file.size);
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 403);
      }
    }

    session.startTransaction();

    const fromWallet = await assertOwnWallet(userId, fromWalletId, session);
    const toWallet = await assertOwnWallet(userId, toWalletId, session);

    if (!fromWallet || !toWallet) {
      await session.abortTransaction();
      return errorResponse(res, "Wallet not found", 404);
    }

    const when = transferDate ? new Date(transferDate) : new Date();
    if (Number.isNaN(when.getTime())) {
      await session.abortTransaction();
      return errorResponse(res, "Invalid transferDate", 400);
    }

    const amt = Number(amount);

    let transferAmounts;
    try {
      transferAmounts = await resolveTransferAmounts({
        amount: amt,
        fromWallet,
        toWallet,
        amountIn,
      });
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
            categoryId: null,
            type: "EXPENSE",
            amount: transferAmounts.fromAmount,
            title: title?.trim() || "Wallet transfer",
            description: description ?? null,
            transactionDate: when,
            categorySnapshot: null,
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
            categoryId: null,
            type: "INCOME",
            amount: transferAmounts.toAmount,
            title: title?.trim() || "Wallet transfer",
            description: description ?? null,
            transactionDate: when,
            categorySnapshot: null,
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
            amount: transferAmounts.fromAmount,
            fromAmount: transferAmounts.fromAmount,
            toAmount: transferAmounts.toAmount,
            fromCurrency: transferAmounts.fromCurrency,
            toCurrency: transferAmounts.toCurrency,
            exchangeRate: transferAmounts.exchangeRate,
            rateUpdatedAt: transferAmounts.rateUpdatedAt,
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

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: debitTx[0]._id,
      file: req.file,
      session,
      replaceTransactionIds: [],
    });

    if (receipt) {
      debitTx[0].receipt = receipt;
      creditTx[0].receipt = receipt;
      transferDoc.receipt = receipt;

      await Promise.all([
        debitTx[0].save({ session }),
        creditTx[0].save({ session }),
      ]);
    }

    await transferDoc.save({ session });

    await session.commitTransaction();

    const populated = await WalletTransfer.findById(transferDoc._id)
      .populate("fromWalletId", "walletName currency")
      .populate("toWalletId", "walletName currency");

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

const assertWalletBalancesAfterTransferUpdate = async (
  userId,
  existingTransfer,
  nextTransfer,
) => {
  const walletIds = [
    existingTransfer.fromWalletId.toString(),
    existingTransfer.toWalletId.toString(),
    nextTransfer.fromWalletId.toString(),
    nextTransfer.toWalletId.toString(),
  ];
  const uniqueWalletIds = [...new Set(walletIds)];
  const balanceMap = await aggregateBalancesByWalletIds(userId, uniqueWalletIds);

  const projectedBalances = new Map(
    uniqueWalletIds.map((walletId) => [
      walletId,
      balanceMap.get(walletId)?.balance ?? 0,
    ]),
  );

  const addToWallet = (walletId, amount) => {
    const key = walletId.toString();
    projectedBalances.set(key, (projectedBalances.get(key) ?? 0) + amount);
  };

  addToWallet(
    existingTransfer.fromWalletId,
    Number(existingTransfer.fromAmount ?? existingTransfer.amount),
  );
  addToWallet(
    existingTransfer.toWalletId,
    -Number(existingTransfer.toAmount ?? existingTransfer.amount),
  );
  addToWallet(nextTransfer.fromWalletId, -Number(nextTransfer.fromAmount));
  addToWallet(nextTransfer.toWalletId, Number(nextTransfer.toAmount));

};

const updateTransfer = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const {
      fromWalletId,
      toWalletId,
      amount,
      title,
      description,
      transferDate,
      removeReceipt,
      amountIn,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid id", 400);
    }

    if (fromWalletId !== undefined && !mongoose.isValidObjectId(fromWalletId)) {
      return errorResponse(res, "Valid fromWalletId is required", 400);
    }

    if (toWalletId !== undefined && !mongoose.isValidObjectId(toWalletId)) {
      return errorResponse(res, "Valid toWalletId is required", 400);
    }

    let parsedAmount;
    if (amount !== undefined) {
      parsedAmount = Number(amount);
      if (parsedAmount <= 0 || Number.isNaN(parsedAmount)) {
        return errorResponse(res, "amount must be a positive number", 400);
      }
    }

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return errorResponse(res, "title must be a non-empty string", 400);
    }

    let parsedTransferDate;
    if (transferDate !== undefined) {
      parsedTransferDate = new Date(transferDate);
      if (Number.isNaN(parsedTransferDate.getTime())) {
        return errorResponse(res, "Invalid transferDate", 400);
      }
    }

    session.startTransaction();

    const transfer = await WalletTransfer.findOne({ _id: id, userId }).session(
      session,
    );

    if (!transfer) {
      await session.abortTransaction();
      return errorResponse(res, "Transfer not found", 404);
    }

    if (req.file) {
      try {
        const replacingBytes = await getReplacingReceiptBytes({
          userId,
          transactionIds: [transfer.debitTransactionId],
          session,
        });
        await assertCanUploadReceipt(userId, req.file.size, {
          replacingBytes,
          session,
        });
      } catch (error) {
        await session.abortTransaction();
        return errorResponse(res, error.message, error.statusCode || 403);
      }
    }

    const nextFromWalletId = fromWalletId ?? transfer.fromWalletId;
    const nextToWalletId = toWalletId ?? transfer.toWalletId;
    const nextInputAmount = parsedAmount ?? transfer.fromAmount ?? transfer.amount;

    if (nextFromWalletId.toString() === nextToWalletId.toString()) {
      await session.abortTransaction();
      return errorResponse(res, "Cannot transfer to the same wallet", 400);
    }

    const [fromWallet, toWallet, debitTx, creditTx] = await Promise.all([
      assertOwnWallet(userId, nextFromWalletId, session),
      assertOwnWallet(userId, nextToWalletId, session),
      WalletTransaction.findOne({
        _id: transfer.debitTransactionId,
        userId,
        isDeleted: false,
      }).session(session),
      WalletTransaction.findOne({
        _id: transfer.creditTransactionId,
        userId,
        isDeleted: false,
      }).session(session),
    ]);

    if (!fromWallet || !toWallet) {
      await session.abortTransaction();
      return errorResponse(res, "Wallet not found", 404);
    }

    if (!debitTx || !creditTx) {
      await session.abortTransaction();
      return errorResponse(res, "Linked transfer transactions not found", 404);
    }

    let nextTransferAmounts;
    try {
      nextTransferAmounts = await resolveTransferAmounts({
        amount: nextInputAmount,
        fromWallet,
        toWallet,
        amountIn,
      });
    } catch (error) {
      await session.abortTransaction();
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    try {
      await assertWalletBalancesAfterTransferUpdate(userId, transfer, {
        fromWalletId: nextFromWalletId,
        toWalletId: nextToWalletId,
        fromAmount: nextTransferAmounts.fromAmount,
        toAmount: nextTransferAmounts.toAmount,
      });
    } catch (error) {
      await session.abortTransaction();
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    const nextTitle =
      title !== undefined ? title.trim() : transfer.title || "Wallet transfer";
    const nextDescription =
      description !== undefined ? description ?? null : transfer.description ?? null;
    const nextDate = parsedTransferDate ?? transfer.transferDate;
    const now = new Date();

    transfer.fromWalletId = nextFromWalletId;
    transfer.toWalletId = nextToWalletId;
    transfer.amount = nextTransferAmounts.fromAmount;
    transfer.fromAmount = nextTransferAmounts.fromAmount;
    transfer.toAmount = nextTransferAmounts.toAmount;
    transfer.fromCurrency = nextTransferAmounts.fromCurrency;
    transfer.toCurrency = nextTransferAmounts.toCurrency;
    transfer.exchangeRate = nextTransferAmounts.exchangeRate;
    transfer.rateUpdatedAt = nextTransferAmounts.rateUpdatedAt;
    transfer.title = nextTitle;
    transfer.description = nextDescription;
    transfer.transferDate = nextDate;
    transfer.updatedAt = now;

    debitTx.walletId = nextFromWalletId;
    debitTx.categoryId = null;
    debitTx.type = "EXPENSE";
    debitTx.amount = nextTransferAmounts.fromAmount;
    debitTx.title = nextTitle;
    debitTx.description = nextDescription;
    debitTx.transactionDate = nextDate;
    debitTx.categorySnapshot = null;
    debitTx.walletSnapshot = {
      walletName: fromWallet.walletName,
      walletColor: fromWallet.color,
    };
    debitTx.updatedAt = now;

    creditTx.walletId = nextToWalletId;
    creditTx.categoryId = null;
    creditTx.type = "INCOME";
    creditTx.amount = nextTransferAmounts.toAmount;
    creditTx.title = nextTitle;
    creditTx.description = nextDescription;
    creditTx.transactionDate = nextDate;
    creditTx.categorySnapshot = null;
    creditTx.walletSnapshot = {
      walletName: toWallet.walletName,
      walletColor: toWallet.color,
    };
    creditTx.updatedAt = now;

    if (removeReceipt === true || removeReceipt === "true") {
      transfer.set("receipt", undefined);
      debitTx.set("receipt", undefined);
      creditTx.set("receipt", undefined);
      await deleteReceiptAttachmentsForTransactions({
        userId,
        transactionIds: [debitTx._id],
        session,
      });
    }

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: debitTx._id,
      file: req.file,
      session,
      replaceTransactionIds: req.file ? [debitTx._id] : [],
    });

    if (receipt) {
      transfer.receipt = receipt;
      debitTx.receipt = receipt;
      creditTx.receipt = receipt;
    }

    await Promise.all([
      transfer.save({ session }),
      debitTx.save({ session }),
      creditTx.save({ session }),
    ]);

    await session.commitTransaction();

    const populated = await WalletTransfer.findById(transfer._id)
      .populate("fromWalletId", "walletName currency")
      .populate("toWalletId", "walletName currency");

    return successResponse(res, "Transfer updated successfully", populated);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return errorResponse(res, error.message, error.statusCode || 500);
  } finally {
    session.endSession();
  }
};

module.exports = {
  listTransfers,
  createTransfer,
  updateTransfer,
};
