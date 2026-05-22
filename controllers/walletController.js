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
    const { walletName } = req.body;

    if (!walletName || typeof walletName !== "string" || !walletName.trim()) {
      return errorResponse(res, "walletName is required", 400);
    }

    await assertCanCreateWallet(req.user.userId);

    const wallet = await Wallet.create({
      userId: req.user.userId,
      isDefault: false,
      walletName: walletName.trim(),
    });

    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { selectedWallets: wallet._id },
      $set: { updatedAt: new Date() },
    });

    return successResponse(res, "Wallet created successfully", wallet, 201);
  } catch (error) {
    const code = error.statusCode || 500;
    return errorResponse(res, error.message, code);
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
  deleteWallet,
};
