const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const WalletTransfer = require("../models/WalletTransfer");
const PlannedPayment = require("../models/PlannedPayment");
const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { aggregateBalancesByWalletIds } = require("../utils/walletBalance");
const { sortWalletsByEffectiveOrder } = require("../utils/walletOrder");
const { assertCanCreateWallet } = require("../utils/planLimits");
const { assertActiveCurrency } = require("../services/exchangeRateService");

const assertOwnWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
    isDeleted: false,
  });
  return wallet;
};

const parseOpeningAmount = (value, fieldName, { allowNegative = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    return { value: 0 };
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || (!allowNegative && parsed < 0)) {
    return {
      error: allowNegative
        ? `${fieldName} must be a valid number`
        : `${fieldName} must be a non-negative number`,
    };
  }

  return { value: parsed };
};

const UNKNOWN_WALLET = {
  walletName: "Unknown wallet",
  walletColor: null,
};

const listWallets = async (req, res) => {
  try {
    const [wallets, user] = await Promise.all([
      Wallet.find({
        userId: req.user.userId,
        isDeleted: false,
      }),
      User.findById(req.user.userId).select("walletOrder").lean(),
    ]);

    const orderedWallets = sortWalletsByEffectiveOrder(wallets, user?.walletOrder ?? []);

    const ids = orderedWallets.map((w) => w._id);
    const balanceMap = await aggregateBalancesByWalletIds(req.user.userId, ids);

    const data = orderedWallets.map((w) => {
      const b = balanceMap.get(w._id.toString()) ?? {
        income: 0,
        expense: 0,
        balance: 0,
      };
      return {
        ...w.toObject(),
        incomeTotal: b.income,
        expenseTotal: b.expense,
        balance: b.balance,
      };
    });

    return successResponse(res, "Wallets fetched successfully", data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getWallet = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const wallet = await assertOwnWallet(req.user.userId, id);
    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    const balanceMap = await aggregateBalancesByWalletIds(req.user.userId, [id]);
    const b = balanceMap.get(id) ?? { income: 0, expense: 0, balance: 0 };

    return successResponse(res, "Wallet fetched successfully", {
      ...wallet.toObject(),
      incomeTotal: b.income,
      expenseTotal: b.expense,
      balance: b.balance,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createWallet = async (req, res) => {
  try {
    const {
      walletName,
      color,
      icon,
      currency,
      incomeTotal,
      expenseTotal,
      balance,
    } = req.body;

    if (!walletName || typeof walletName !== "string" || !walletName.trim()) {
      return errorResponse(res, "walletName is required", 400);
    }

    let currencyCode;
    if (currency !== undefined && String(currency).trim() !== "") {
      try {
        const activeCurrency = await assertActiveCurrency(currency);
        currencyCode = activeCurrency.code;
      } catch (error) {
        return errorResponse(res, error.message, error.statusCode || 400);
      }
    } else {
      const user = await User.findById(req.user.userId).select("currency").lean();
      if (user?.currency) {
        try {
          const activeCurrency = await assertActiveCurrency(user.currency);
          currencyCode = activeCurrency.code;
        } catch (error) {
          return errorResponse(res, error.message, error.statusCode || 400);
        }
      }
    }

    const parsedIncomeTotal = parseOpeningAmount(incomeTotal, "incomeTotal");
    if (parsedIncomeTotal.error) {
      return errorResponse(res, parsedIncomeTotal.error, 400);
    }

    const parsedExpenseTotal = parseOpeningAmount(expenseTotal, "expenseTotal");
    if (parsedExpenseTotal.error) {
      return errorResponse(res, parsedExpenseTotal.error, 400);
    }

    const parsedBalance = parseOpeningAmount(balance, "balance", {
      allowNegative: true,
    });
    if (parsedBalance.error) {
      return errorResponse(res, parsedBalance.error, 400);
    }

    await assertCanCreateWallet(req.user.userId);

    const openingAmount =
      balance === undefined || balance === null || balance === ""
        ? parsedIncomeTotal.value - parsedExpenseTotal.value
        : parsedBalance.value;

    const payload = {
      userId: req.user.userId,
      isDefault: false,
      walletName: walletName.trim(),
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
    };

    if (color !== undefined) {
      payload.color = String(color).trim();
    }

    if (icon !== undefined) {
      payload.icon = String(icon).trim();
    }

    payload.currency = currencyCode || "USD";

    const wallet = await Wallet.create(payload);

    if (openingAmount !== 0) {
      await WalletTransaction.create({
        userId: req.user.userId,
        walletId: wallet._id,
        categoryId: null,
        type: openingAmount > 0 ? "INCOME" : "EXPENSE",
        amount: Math.abs(openingAmount),
        title: "Opening balance",
        description: null,
        transactionDate: new Date(),
        categorySnapshot: null,
        walletSnapshot: {
          walletName: wallet.walletName,
          walletColor: wallet.color,
        },
        createdBy: req.user.userId,
      });
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { selectedWallets: wallet._id },
      $push: { walletOrder: wallet._id },
      $set: { updatedAt: new Date() },
    });

    const balanceMap = await aggregateBalancesByWalletIds(req.user.userId, [
      wallet._id,
    ]);
    const b = balanceMap.get(wallet._id.toString()) ?? {
      income: 0,
      expense: 0,
      balance: 0,
    };

    return successResponse(res, "Wallet created successfully", {
      ...wallet.toObject(),
      incomeTotal: b.income,
      expenseTotal: b.expense,
      balance: b.balance,
    }, 201);
  } catch (error) {
    const code = error.statusCode || 500;
    return errorResponse(res, error.message, code);
  }
};

const updateWallet = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { walletName, color, icon, currency, balance } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const userId = req.user.userId;
    const wallet = await assertOwnWallet(userId, id);
    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    const parsedBalance =
      balance === undefined
        ? null
        : parseOpeningAmount(balance, "balance", { allowNegative: true });

    if (parsedBalance?.error) {
      return errorResponse(res, parsedBalance.error, 400);
    }

    const balanceMap = await aggregateBalancesByWalletIds(userId, [id]);
    const currentBalance = balanceMap.get(id)?.balance ?? 0;
    const adjustmentAmount =
      parsedBalance === null
        ? 0
        : Number((parsedBalance.value - currentBalance).toFixed(2));

    session.startTransaction();

    if (walletName !== undefined) {
      if (typeof walletName !== "string" || !walletName.trim()) {
        await session.abortTransaction();
        return errorResponse(res, "walletName must be a non-empty string", 400);
      }
      wallet.walletName = walletName.trim();
    }

    if (color !== undefined) {
      wallet.color = String(color).trim();
    }

    if (icon !== undefined) {
      wallet.icon = String(icon).trim();
    }

    if (currency !== undefined && String(currency).trim() !== "") {
      try {
        const activeCurrency = await assertActiveCurrency(currency);
        wallet.currency = activeCurrency.code;
      } catch (error) {
        await session.abortTransaction();
        return errorResponse(res, error.message, error.statusCode || 400);
      }
    }

    wallet.updatedAt = new Date();
    await wallet.save({ session });

    if (Math.abs(adjustmentAmount) > 0) {
      const adjustmentType = adjustmentAmount > 0 ? "INCOME" : "EXPENSE";
      const adjustmentValue = Math.abs(adjustmentAmount);

      await WalletTransaction.create(
        [
          {
            userId,
            walletId: id,
            categoryId: null,
            type: adjustmentType,
            amount: adjustmentValue,
            title: "Payment adjustment",
            description: `Wallet balance adjusted from ${currentBalance} to ${parsedBalance.value}.`,
            transactionDate: new Date(),
            categorySnapshot: null,
            walletSnapshot: {
              walletName: wallet.walletName,
              walletColor: wallet.color,
            },
            createdBy: userId,
          },
        ],
        { session },
      );
    }

    await session.commitTransaction();

    const updatedBalanceMap = await aggregateBalancesByWalletIds(userId, [id]);
    const b = updatedBalanceMap.get(id) ?? { income: 0, expense: 0, balance: 0 };

    return successResponse(res, "Wallet updated successfully", {
      ...wallet.toObject(),
      incomeTotal: b.income,
      expenseTotal: b.expense,
      balance: b.balance,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

const deleteWallet = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    session.startTransaction();

    const wallet = await Wallet.findOne({
      _id: id,
      userId: req.user.userId,
      isDeleted: false,
    }).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return errorResponse(res, "Wallet not found", 404);
    }

    const user = await User.findById(req.user.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return errorResponse(res, "User not found", 404);
    }

    const transfers = await WalletTransfer.find({
      userId: req.user.userId,
      $or: [{ fromWalletId: id }, { toWalletId: id }],
    }).session(session);

    const counterpartTxIds = [];

    for (const transfer of transfers) {
      const isFromDeletedWallet = transfer.fromWalletId.toString() === id;
      const isToDeletedWallet = transfer.toWalletId.toString() === id;

      if (!isFromDeletedWallet && transfer.debitTransactionId) {
        counterpartTxIds.push(transfer.debitTransactionId);
      }
      if (!isToDeletedWallet && transfer.creditTransactionId) {
        counterpartTxIds.push(transfer.creditTransactionId);
      }
    }

    if (counterpartTxIds.length) {
      await WalletTransaction.updateMany(
        {
          _id: { $in: counterpartTxIds },
          userId: req.user.userId,
          isDeleted: false,
        },
        {
          $set: {
            walletId: null,
            walletSnapshot: UNKNOWN_WALLET,
            updatedAt: new Date(),
          },
        },
        { session },
      );
    }

    for (const transfer of transfers) {
      const isFromDeletedWallet = transfer.fromWalletId.toString() === id;
      const isToDeletedWallet = transfer.toWalletId.toString() === id;
      const transferUpdates = { updatedAt: new Date() };

      if (isFromDeletedWallet) {
        transferUpdates.debitTransactionId = null;
      }
      if (isToDeletedWallet) {
        transferUpdates.creditTransactionId = null;
      }

      if (isFromDeletedWallet || isToDeletedWallet) {
        await WalletTransfer.updateOne(
          { _id: transfer._id },
          { $set: transferUpdates },
          { session },
        );
      }
    }

    // Hard-delete all transactions in this wallet (including transfer legs on this side).
    // Counterpart transfer transactions on other wallets are kept and marked unknown above.
    await WalletTransaction.deleteMany(
      {
        userId: req.user.userId,
        walletId: id,
      },
      { session },
    );

    await PlannedPayment.deleteMany(
      { userId: req.user.userId, walletId: id },
      { session },
    );

    await Wallet.deleteOne({ _id: id, userId: req.user.userId }, { session });

    user.selectedWallets = (user.selectedWallets || []).filter(
      (w) => w.toString() !== id,
    );
    user.walletOrder = (user.walletOrder || []).filter((w) => w.toString() !== id);

    if (user.defaultWalletId?.toString() === id) {
      const nextWallet = await Wallet.findOne({
        userId: req.user.userId,
        isDeleted: false,
      })
        .sort({ createdAt: 1 })
        .session(session);
      user.defaultWalletId = nextWallet?._id ?? null;
    }

    user.updatedAt = new Date();
    await user.save({ session });

    await session.commitTransaction();

    return successResponse(res, "Wallet deleted successfully");
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

const getWalletOrder = async (req, res) => {
  try {
    const [wallets, user] = await Promise.all([
      Wallet.find({ userId: req.user.userId, isDeleted: false }).lean(),
      User.findById(req.user.userId).select("walletOrder").lean(),
    ]);

    const orderedWallets = sortWalletsByEffectiveOrder(wallets, user?.walletOrder ?? []);
    return successResponse(res, "Wallet order fetched successfully", {
      walletIds: orderedWallets.map((wallet) => wallet._id),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateWalletOrder = async (req, res) => {
  try {
    const { walletIds } = req.body;

    if (!Array.isArray(walletIds)) {
      return errorResponse(res, "walletIds must be an array", 400);
    }

    const normalizedIds = walletIds.map((walletId) => walletId?.toString?.());
    if (normalizedIds.some((walletId) => !mongoose.isValidObjectId(walletId))) {
      return errorResponse(res, "walletIds must contain valid wallet ids", 400);
    }

    const uniqueIds = [...new Set(normalizedIds)];
    if (uniqueIds.length !== normalizedIds.length) {
      return errorResponse(res, "walletIds cannot contain duplicates", 400);
    }

    const activeWallets = await Wallet.find({
      userId: req.user.userId,
      isDeleted: false,
    }).select("_id");
    const activeIds = activeWallets.map((wallet) => wallet._id.toString());

    if (uniqueIds.length !== activeIds.length) {
      return errorResponse(
        res,
        "walletIds must include all active wallets exactly once",
        400,
      );
    }

    const activeSet = new Set(activeIds);
    if (uniqueIds.some((walletId) => !activeSet.has(walletId))) {
      return errorResponse(res, "walletIds contain invalid wallets", 400);
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $set: {
        walletOrder: uniqueIds,
        updatedAt: new Date(),
      },
    });

    return successResponse(res, "Wallet order updated successfully", {
      walletIds: uniqueIds,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listWallets,
  getWallet,
  createWallet,
  updateWallet,
  deleteWallet,
  getWalletOrder,
  updateWalletOrder,
};
