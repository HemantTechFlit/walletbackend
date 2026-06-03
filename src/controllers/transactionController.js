const mongoose = require("mongoose");

const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const Attachment = require("../models/Attachment");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { uploadReceipt } = require("../utils/r2Storage");
const {
  aggregateBalancesByWalletIds,
  assertSufficientWalletBalance,
} = require("../utils/walletBalance");

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

const assertOwnWallet = (userId, walletId) =>
  Wallet.findOne({ _id: walletId, userId, isDeleted: false });

const assertCategoryForUser = async (userId, categoryId) =>
  TransactionCategory.findOne({
    _id: categoryId,
    userId,
    isDeleted: false,
  });

const createReceiptAttachment = async ({ userId, transactionId, file }) => {
  if (!file) {
    return null;
  }

  const uploaded = await uploadReceipt({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    userId,
  });

  const attachment = await Attachment.create({
    userId,
    transactionId,
    fileUrl: uploaded.url,
    storageKey: uploaded.key,
    originalName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
    purpose: "RECEIPT",
  });

  return {
    attachmentId: attachment._id,
    fileUrl: attachment.fileUrl,
    storageKey: attachment.storageKey,
    originalName: attachment.originalName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    uploadedAt: attachment.uploadedAt,
  };
};

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
        .populate("walletId", "walletName")
        .populate("categoryId", "name isDefault")
        .lean(),
      WalletTransaction.countDocuments(filter),
    ]);

    return successResponse(res, "Transactions fetched successfully", {
      items,
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
      .populate("walletId", "walletName")
      .populate("categoryId", "name");

    if (!tx) {
      return errorResponse(res, "Transaction not found", 404);
    }

    return successResponse(res, "Transaction fetched successfully", tx);
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
    if (!title || typeof title !== "string" || !title.trim()) {
      return errorResponse(res, "title is required", 400);
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

    const amt = Number(amount);

    if (type === "EXPENSE") {
      try {
        await assertSufficientWalletBalance(userId, walletId, amt);
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 400);
      }
    }

    const doc = await WalletTransaction.create({
      userId,
      walletId,
      categoryId: category?._id ?? null,
      type,
      amount: amt,
      title: title.trim(),
      description: description ?? null,
      transactionDate: txDate,
      categorySnapshot: category
        ? { name: category.name, color: category.color, icon: category.icon }
        : null,
      walletSnapshot: { walletName: wallet.walletName },
      createdBy: userId,
    });

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: doc._id,
      file: req.file,
    });

    if (receipt) {
      doc.receipt = receipt;
      await doc.save();
    }

    const populated = await WalletTransaction.findById(doc._id)
      .populate("walletId", "walletName")
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

  const hasNegativeBalance = [...projectedBalances.values()].some(
    (balance) => balance < 0,
  );

  if (hasNegativeBalance) {
    const err = new Error("Your wallet balance is less than the payment amount.");
    err.statusCode = 400;
    throw err;
  }
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

    if (walletId !== undefined && !mongoose.isValidObjectId(walletId)) {
      return errorResponse(res, "Valid walletId is required", 400);
    }

    if (categoryId !== undefined && !mongoose.isValidObjectId(categoryId)) {
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

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return errorResponse(res, "title must be a non-empty string", 400);
    }

    let parsedTransactionDate;
    if (transactionDate !== undefined) {
      parsedTransactionDate = new Date(transactionDate);
      if (Number.isNaN(parsedTransactionDate.getTime())) {
        return errorResponse(res, "Invalid transactionDate", 400);
      }
    }

    const nextWalletId = walletId ?? transaction.walletId;
    const nextCategoryId = categoryId ?? transaction.categoryId;
    const nextType = type ?? transaction.type;
    const nextAmount = parsedAmount ?? transaction.amount;

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

    if (title !== undefined) {
      transaction.title = title.trim();
    }

    if (description !== undefined) {
      transaction.description = description ?? null;
    }

    if (parsedTransactionDate) {
      transaction.transactionDate = parsedTransactionDate;
    }

    if (removeReceipt === true || removeReceipt === "true") {
      transaction.set("receipt", undefined);
      await Attachment.updateMany(
        { transactionId: transaction._id, userId, purpose: "RECEIPT" },
        { $set: { transactionId: null } },
      );
    }

    const receipt = await createReceiptAttachment({
      userId,
      transactionId: transaction._id,
      file: req.file,
    });

    if (receipt) {
      transaction.receipt = receipt;
    }

    transaction.categorySnapshot = {
      name: category?.name,
      color: category?.color,
      icon: category?.icon,
    };
    transaction.walletSnapshot = {
      walletName: wallet.walletName,
      walletColor: wallet.color,
    };
    transaction.updatedAt = new Date();

    await transaction.save();

    const populated = await WalletTransaction.findById(transaction._id)
      .populate("walletId", "walletName")
      .populate("categoryId", "name");

    return successResponse(res, "Transaction updated successfully", populated);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid id", 400);
    }

    const tx = await WalletTransaction.findOneAndUpdate(
      {
        _id: id,
        userId: req.user.userId,
        isDeleted: false,
      },
      { $set: { isDeleted: true, updatedAt: new Date() } },
      { new: true },
    );

    if (!tx) {
      return errorResponse(res, "Transaction not found", 404);
    }

    return successResponse(res, "Transaction deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
