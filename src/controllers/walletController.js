const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { aggregateBalancesByWalletIds } = require("../utils/walletBalance");
const { assertCanCreateWallet } = require("../utils/planLimits");

const assertOwnWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
    isDeleted: false,
  });
  return wallet;
};

const parseOpeningAmount = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return { value: 0 };
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return { error: `${fieldName} must be a non-negative number` };
  }

  return { value: parsed };
};

const listWallets = async (req, res) => {
  try {
    const wallets = await Wallet.find({
      userId: req.user.userId,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    const ids = wallets.map((w) => w._id);
    const balanceMap = await aggregateBalancesByWalletIds(req.user.userId, ids);

    const data = wallets.map((w) => {
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
      currencyCode = String(currency).trim().toUpperCase();
      if (currencyCode.length !== 3) {
        return errorResponse(res, "currency must be a 3-letter code", 400);
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

    const parsedBalance = parseOpeningAmount(balance, "balance");
    if (parsedBalance.error) {
      return errorResponse(res, parsedBalance.error, 400);
    }

    await assertCanCreateWallet(req.user.userId);

    const payload = {
      userId: req.user.userId,
      isDefault: false,
      walletName: walletName.trim(),
      incomeTotal: parsedIncomeTotal.value,
      expenseTotal: parsedExpenseTotal.value,
      balance:
        balance === undefined || balance === null || balance === ""
          ? parsedIncomeTotal.value - parsedExpenseTotal.value
          : parsedBalance.value,
    };

    if (color !== undefined) {
      payload.color = String(color).trim();
    }

    if (icon !== undefined) {
      payload.icon = String(icon).trim();
    }

    if (currencyCode) {
      payload.currency = currencyCode;
    }

    const wallet = await Wallet.create(payload);

    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { selectedWallets: wallet._id },
      $set: { updatedAt: new Date() },
    });

    return successResponse(res, "Wallet created successfully", {
      ...wallet.toObject(),
      incomeTotal: wallet.incomeTotal,
      expenseTotal: wallet.expenseTotal,
      balance: wallet.balance,
    }, 201);
  } catch (error) {
    const code = error.statusCode || 500;
    return errorResponse(res, error.message, code);
  }
};

const updateWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletName, color, icon, currency } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const wallet = await assertOwnWallet(req.user.userId, id);
    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    if (walletName !== undefined) {
      if (typeof walletName !== "string" || !walletName.trim()) {
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
      const currencyCode = String(currency).trim().toUpperCase();
      if (currencyCode.length !== 3) {
        return errorResponse(res, "currency must be a 3-letter code", 400);
      }
      wallet.currency = currencyCode;
    }

    wallet.updatedAt = new Date();
    await wallet.save();

    const balanceMap = await aggregateBalancesByWalletIds(req.user.userId, [id]);
    const b = balanceMap.get(id) ?? { income: 0, expense: 0, balance: 0 };

    return successResponse(res, "Wallet updated successfully", {
      ...wallet.toObject(),
      incomeTotal: b.income,
      expenseTotal: b.expense,
      balance: b.balance,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteWallet = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const wallet = await Wallet.findOne({
      _id: id,
      userId: req.user.userId,
      isDeleted: false,
    });

    if (!wallet) {
      return errorResponse(res, "Wallet not found", 404);
    }

    wallet.isDeleted = true;
    wallet.updatedAt = new Date();
    await wallet.save();

    const user = await User.findById(req.user.userId);
    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    user.selectedWallets = (user.selectedWallets || []).filter(
      (w) => w.toString() !== id,
    );

    if (user.defaultWalletId?.toString() === id) {
      const nextWallet = await Wallet.findOne({
        userId: req.user.userId,
        isDeleted: false,
      }).sort({ createdAt: 1 });
      user.defaultWalletId = nextWallet?._id ?? null;
    }

    user.updatedAt = new Date();
    await user.save();

    return successResponse(res, "Wallet deleted successfully");
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
};
