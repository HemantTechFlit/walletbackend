const mongoose = require("mongoose");

const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const WalletTransfer = require("../models/WalletTransfer");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const {
  assertCanUploadReceipt,
  getReplacingReceiptBytes,
  deleteReceiptAttachmentsForTransactions,
  createReceiptAttachment,
} = require("../utils/receiptUpload");
const {
  aggregateBalancesByWalletIds,
  formatWalletBalancePayload,
} = require("../utils/walletBalance");
const { resolveTransactionAmount } = require("../utils/currencyConversion");
const {
  parseBooleanFlag,
  findTransferForTransaction,
  getTransferLegRole,
  convertCounterpartAmount,
  loadTransferLegs,
} = require("../utils/transferTransactionSync");

const parseDate = (value, endOfDay = false) => {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
};

const normalizeTransactionReferences = (transaction) => {
  const normalized = { ...transaction };

  if (!normalized.walletId) {
    normalized.walletId = {
      _id: null,
      walletName: normalized.walletSnapshot?.walletName || "Unknown wallet",
      currency: null,
    };
  }

  const hasUnknownCategory =
    normalized.categorySnapshot?.name === "Unknown category";

  if (!normalized.categoryId && hasUnknownCategory) {
    normalized.categoryId = {
      _id: null,
      name: "Unknown category",
      color: normalized.categorySnapshot?.color ?? null,
      icon: normalized.categorySnapshot?.icon ?? null,
      isDefault: false,
    };
  }

  return normalized;
};

const assertOwnWallet = (userId, walletId) =>
  Wallet.findOne({ _id: walletId, userId, isDeleted: false });

const assertCategoryForUser = async (userId, categoryId) =>
  TransactionCategory.findOne({
    _id: categoryId,
    userId,
    isDeleted: false,
  });

const listTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { userId, isDeleted: false };

    if (req.query.walletId) {
      if (!mongoose.isValidObjectId(req.query.walletId)) {
        return errorResponse(res, "Invalid walletId", 400);
      }
      filter.walletId = req.query.walletId;
    }

    if (req.query.type && ["INCOME", "EXPENSE"].includes(req.query.type)) {
      filter.type = req.query.type;
    }

    if (req.query.categoryId) {
      if (!mongoose.isValidObjectId(req.query.categoryId)) {
        return errorResponse(res, "Invalid categoryId", 400);
      }
      filter.categoryId = req.query.categoryId;
    }

    const from = parseDate(req.query.fromDate, false);
    const to = parseDate(req.query.toDate, true);
    if (req.query.fromDate && !from) {
      return errorResponse(res, "Invalid fromDate", 400);
    }
    if (req.query.toDate && !to) {
      return errorResponse(res, "Invalid toDate", 400);
    }
    if (from || to) {
      filter.transactionDate = {};
      if (from) {
        filter.transactionDate.$gte = from;
      }
      if (to) {
        filter.transactionDate.$lte = to;
      }
    }

    const [items, total] = await Promise.all([
      WalletTransaction.find(filter)
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("walletId", "walletName currency")
        .populate("categoryId", "name isDefault")
        .lean(),
      WalletTransaction.countDocuments(filter),
    ]);

    return successResponse(res, "Transactions fetched successfully", {
      items: items.map(normalizeTransactionReferences),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid id", 400);
    }

    const tx = await WalletTransaction.findOne({
      _id: id,
      userId: req.user.userId,
      isDeleted: false,
    })
      .populate("walletId", "walletName currency")
      .populate("categoryId", "name");

    if (!tx) {
      return errorResponse(res, "Transaction not found", 404);
    }

    return successResponse(
      res,
      "Transaction fetched successfully",
      normalizeTransactionReferences(tx.toObject()),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createTransaction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      walletId,
      categoryId,
      type,
      amount,
      title,
      description,
      transactionDate,
      amountCurrency,
      amountIn,
    } = req.body;

    if (!walletId || !mongoose.isValidObjectId(walletId)) {
      return errorResponse(res, "Valid walletId is required", 400);
    }
    if (categoryId && !mongoose.isValidObjectId(categoryId)) {
      return errorResponse(res, "Valid categoryId is required", 400);
    }
    if (!type || !["INCOME", "EXPENSE"].includes(type)) {
      return errorResponse(res, "type must be INCOME or EXPENSE", 400);
    }
    if (amount === undefined || Number(amount) <= 0 || Number.isNaN(Number(amount))) {
      return errorResponse(res, "amount must be a positive number", 400);
    }
    const wallet = await assertOwnWallet(userId, walletId);
    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    const category = categoryId
      ? await assertCategoryForUser(userId, categoryId)
      : null;
    if (categoryId && !category) {
      return errorResponse(res, "Category not found", 404);
    }

    const txDate = transactionDate ? new Date(transactionDate) : new Date();
    if (Number.isNaN(txDate.getTime())) {
      return errorResponse(res, "Invalid transactionDate", 400);
    }

    let transactionAmounts;
    try {
      transactionAmounts = await resolveTransactionAmount({
        amount,
        wallet,
        amountCurrency,
        amountIn,
      });
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    const amt = transactionAmounts.amount;

    if (req.file) {
      try {
        await assertCanUploadReceipt(userId, req.file.size);
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 403);
      }
    }

    const doc = await WalletTransaction.create({
      userId,
      walletId,
      categoryId: category?._id ?? null,
      type,
      amount: amt,
      inputAmount: transactionAmounts.inputAmount,
      inputCurrency: transactionAmounts.inputCurrency,
      walletCurrency: transactionAmounts.walletCurrency,
      exchangeRate: transactionAmounts.exchangeRate,
      rateUpdatedAt: transactionAmounts.rateUpdatedAt,
      title: typeof title === "string" && title.trim() ? title.trim() : null,
      description: description ?? null,
      transactionDate: txDate,
      categorySnapshot: category
        ? { name: category.name, color: category.color, icon: category.icon }
        : null,
      walletSnapshot: {
        walletName: wallet.walletName,
        walletColor: wallet.color,
      },
      createdBy: userId,
    });

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: doc._id,
      file: req.file,
      replaceTransactionIds: [],
    });

    if (receipt) {
      doc.receipt = receipt;
      await doc.save();
    }

    const populated = await WalletTransaction.findById(doc._id)
      .populate("walletId", "walletName currency")
      .populate("categoryId", "name");

    return successResponse(res, "Transaction created successfully", populated, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getTransactionWalletEffect = (transaction) => {
  const amount = Number(transaction.amount);
  return transaction.type === "INCOME" ? amount : -amount;
};

const assertWalletBalancesAfterTransactionUpdate = async (
  userId,
  existingTransaction,
  nextTransaction,
) => {
  const walletIds = [
    existingTransaction.walletId.toString(),
    nextTransaction.walletId.toString(),
  ];
  const uniqueWalletIds = [...new Set(walletIds)];
  const balanceMap = await aggregateBalancesByWalletIds(userId, uniqueWalletIds);

  const projectedBalances = new Map(
    uniqueWalletIds.map((walletId) => [
      walletId,
      balanceMap.get(walletId)?.balance ?? 0,
    ]),
  );

  const existingWalletId = existingTransaction.walletId.toString();
  const nextWalletId = nextTransaction.walletId.toString();

  projectedBalances.set(
    existingWalletId,
    projectedBalances.get(existingWalletId) -
      getTransactionWalletEffect(existingTransaction),
  );
  projectedBalances.set(
    nextWalletId,
    projectedBalances.get(nextWalletId) +
      getTransactionWalletEffect(nextTransaction),
  );

};

const updateTransaction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const {
      walletId,
      categoryId,
      type,
      amount,
      title,
      description,
      transactionDate,
      removeReceipt,
      amountCurrency,
      amountIn,
      updateReferenceTransaction,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid id", 400);
    }

    const transaction = await WalletTransaction.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!transaction) {
      return errorResponse(res, "Transaction not found", 404);
    }

    if (req.file) {
      try {
        const replacingBytes = await getReplacingReceiptBytes({
          userId,
          transactionIds: [transaction._id],
        });
        await assertCanUploadReceipt(userId, req.file.size, { replacingBytes });
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 403);
      }
    }

    if (walletId !== undefined && !mongoose.isValidObjectId(walletId)) {
      return errorResponse(res, "Valid walletId is required", 400);
    }

    if (
      categoryId !== undefined &&
      categoryId !== null &&
      categoryId !== "" &&
      !mongoose.isValidObjectId(categoryId)
    ) {
      return errorResponse(res, "Valid categoryId is required", 400);
    }

    if (type !== undefined && !["INCOME", "EXPENSE"].includes(type)) {
      return errorResponse(res, "type must be INCOME or EXPENSE", 400);
    }

    let parsedAmount;
    if (amount !== undefined) {
      parsedAmount = Number(amount);
      if (parsedAmount <= 0 || Number.isNaN(parsedAmount)) {
        return errorResponse(res, "amount must be a positive number", 400);
      }
    }

    let parsedTransactionDate;
    if (transactionDate !== undefined) {
      parsedTransactionDate = new Date(transactionDate);
      if (Number.isNaN(parsedTransactionDate.getTime())) {
        return errorResponse(res, "Invalid transactionDate", 400);
      }
    }

    const nextWalletId = walletId ?? transaction.walletId;
    let nextCategoryId;
    if (categoryId === undefined) {
      nextCategoryId = transaction.categoryId;
    } else if (categoryId === null || categoryId === "") {
      nextCategoryId = null;
    } else {
      nextCategoryId = categoryId;
    }
    const nextType = type ?? transaction.type;
    const nextAmountIn =
      amountIn !== undefined
        ? amountIn
        : transaction.inputCurrency
          ? "to"
          : "from";
    const nextAmountCurrency =
      nextAmountIn === "from"
        ? amountCurrency
        : amountCurrency !== undefined
          ? amountCurrency
          : transaction.inputCurrency ?? undefined;
    const nextInputAmount =
      parsedAmount ??
      (nextAmountIn === "to"
        ? transaction.inputAmount ?? transaction.amount
        : transaction.amount);

    const [wallet, category] = await Promise.all([
      assertOwnWallet(userId, nextWalletId),
      nextCategoryId ? assertCategoryForUser(userId, nextCategoryId) : null,
    ]);

    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    if (nextCategoryId && !category) {
      return errorResponse(res, "Category not found", 404);
    }

    let transactionAmounts;
    const shouldRecalculateAmount =
      parsedAmount !== undefined ||
      walletId !== undefined ||
      amountCurrency !== undefined ||
      amountIn !== undefined;

    if (shouldRecalculateAmount) {
      try {
        transactionAmounts = await resolveTransactionAmount({
          amount: nextInputAmount,
          wallet,
          amountCurrency: nextAmountCurrency,
          amountIn: nextAmountIn,
        });
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 400);
      }
    } else {
      transactionAmounts = {
        amount: transaction.amount,
        inputAmount: transaction.inputAmount ?? null,
        inputCurrency: transaction.inputCurrency ?? null,
        walletCurrency: transaction.walletCurrency ?? wallet.currency,
        exchangeRate: transaction.exchangeRate ?? null,
        rateUpdatedAt: transaction.rateUpdatedAt ?? null,
      };
    }

    const nextAmount = transactionAmounts.amount;

    try {
      await assertWalletBalancesAfterTransactionUpdate(userId, transaction, {
        walletId: nextWalletId,
        type: nextType,
        amount: nextAmount,
      });
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    transaction.walletId = nextWalletId;
    transaction.categoryId = nextCategoryId;
    transaction.type = nextType;
    transaction.amount = nextAmount;
    transaction.inputAmount = transactionAmounts.inputAmount;
    transaction.inputCurrency = transactionAmounts.inputCurrency;
    transaction.walletCurrency = transactionAmounts.walletCurrency;
    transaction.exchangeRate = transactionAmounts.exchangeRate;
    transaction.rateUpdatedAt = transactionAmounts.rateUpdatedAt;

    if (title !== undefined) {
      transaction.title =
        typeof title === "string" && title.trim() ? title.trim() : null;
    }

    if (description !== undefined) {
      transaction.description = description ?? null;
    }

    if (parsedTransactionDate) {
      transaction.transactionDate = parsedTransactionDate;
    }

    if (removeReceipt === true || removeReceipt === "true") {
      transaction.set("receipt", undefined);
      await deleteReceiptAttachmentsForTransactions({
        userId,
        transactionIds: [transaction._id],
      });
    }

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: transaction._id,
      file: req.file,
      replaceTransactionIds: req.file ? [transaction._id] : [],
    });

    if (receipt) {
      transaction.receipt = receipt;
    }

    transaction.categorySnapshot = category
      ? {
          name: category.name,
          color: category.color,
          icon: category.icon,
        }
      : null;
    transaction.walletSnapshot = {
      walletName: wallet.walletName,
      walletColor: wallet.color,
    };
    transaction.updatedAt = new Date();

    const shouldUpdateReference = parseBooleanFlag(updateReferenceTransaction);

    if (shouldUpdateReference) {
      const transfer = await findTransferForTransaction(userId, transaction._id);

      if (transfer) {
        const role = getTransferLegRole(transfer, transaction._id);

        if (role) {
          const { debitTx, creditTx } = await loadTransferLegs(userId, transfer);
          const counterpart = role === "debit" ? creditTx : debitTx;
          const nextCounterpartAmount = convertCounterpartAmount(
            transfer,
            role,
            nextAmount,
          );
          const nextTitle =
            title !== undefined
              ? typeof title === "string" && title.trim()
                ? title.trim()
                : null
              : transaction.title;
          const nextDescription =
            description !== undefined
              ? description ?? null
              : transaction.description;
          const nextDate = parsedTransactionDate ?? transaction.transactionDate;

          counterpart.amount = nextCounterpartAmount;
          counterpart.title = nextTitle;
          counterpart.description = nextDescription;
          counterpart.transactionDate = nextDate;
          counterpart.updatedAt = new Date();

          if (role === "debit") {
            transfer.fromAmount = nextAmount;
            transfer.toAmount = nextCounterpartAmount;
            transfer.amount = nextAmount;
          } else {
            transfer.fromAmount = nextCounterpartAmount;
            transfer.toAmount = nextAmount;
            transfer.amount = nextCounterpartAmount;
          }

          transfer.title = nextTitle || transfer.title || "Wallet transfer";
          transfer.description = nextDescription;
          transfer.transferDate = nextDate;
          transfer.updatedAt = new Date();

          const counterpartWallet = await Wallet.findById(counterpart.walletId).select(
            "walletName color",
          );

          if (counterpartWallet) {
            counterpart.walletSnapshot = {
              walletName: counterpartWallet.walletName,
              walletColor: counterpartWallet.color,
            };
          }

          await Promise.all([counterpart.save(), transfer.save()]);
        }
      }
    }

    await transaction.save();

    const populated = await WalletTransaction.findById(transaction._id)
      .populate("walletId", "walletName currency")
      .populate("categoryId", "name");

    return successResponse(res, "Transaction updated successfully", populated);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const deleteTransaction = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const deleteReferenceTransaction =
      req.body?.deleteReferenceTransaction ?? req.query?.deleteReferenceTransaction;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid id", 400);
    }

    session.startTransaction();

    const tx = await WalletTransaction.findOne({
      _id: id,
      userId,
    }).session(session);

    if (!tx) {
      await session.abortTransaction();
      return errorResponse(res, "Transaction not found", 404);
    }

    if (tx.isDeleted) {
      const affectedWallets = await formatWalletBalancePayload(userId, [tx.walletId]);
      await session.commitTransaction();
      return successResponse(res, "Transaction deleted successfully", {
        affectedWallets,
      });
    }

    const shouldDeleteReference = parseBooleanFlag(deleteReferenceTransaction);
    const now = new Date();
    const idsToDelete = [tx._id];
    let transferToRemove = null;

    if (shouldDeleteReference) {
      transferToRemove = await findTransferForTransaction(userId, tx._id, session);

      if (transferToRemove) {
        const role = getTransferLegRole(transferToRemove, tx._id);

        if (role) {
          const counterpartId =
            role === "debit"
              ? transferToRemove.creditTransactionId
              : transferToRemove.debitTransactionId;

          if (counterpartId) {
            idsToDelete.push(counterpartId);
          }
        }
      }
    }

    const transactionsToDelete = await WalletTransaction.find({
      _id: { $in: idsToDelete },
      userId,
      isDeleted: false,
    })
      .select("walletId")
      .session(session);

    const affectedWalletIds = transactionsToDelete
      .map((item) => item.walletId)
      .filter(Boolean);

    await deleteReceiptAttachmentsForTransactions({
      userId,
      transactionIds: idsToDelete,
      session,
    });

    await WalletTransaction.updateMany(
      {
        _id: { $in: idsToDelete },
        userId,
        isDeleted: false,
      },
      { $set: { isDeleted: true, updatedAt: now } },
      { session },
    );

    if (transferToRemove) {
      await WalletTransfer.deleteOne(
        { _id: transferToRemove._id, userId },
        { session },
      );
    }

    await session.commitTransaction();

    const affectedWallets = await formatWalletBalancePayload(
      userId,
      affectedWalletIds,
    );

    return successResponse(res, "Transaction deleted successfully", {
      affectedWallets,
    });
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
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
