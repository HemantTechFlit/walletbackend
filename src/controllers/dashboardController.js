const User = require("../models/User");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const WalletTransaction = require("../models/WalletTransaction");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { getEffectivePlanForUser } = require("../utils/planLimits");
const {
  buildReceiptRetentionInfo,
  buildReceiptRetentionWarnings,
  buildReceiptStorageInfo,
} = require("../utils/receiptUpload");
const { aggregateBalancesByWalletIds } = require("../utils/walletBalance");
const { sortWalletsByEffectiveOrder } = require("../utils/walletOrder");
const { fetchPlannedPaymentOccurrences } = require("../utils/plannedPaymentOccurrences");

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

const { syncUserSelectionsFromDb } = require("../utils/userProfile");

const getDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(req.query.perPage, 10) || 20),
    );
    const skip = (page - 1) * perPage;
    const days = Number(req.query.days);

    if (!Number.isInteger(days) || days < 0) {
      return errorResponse(res, "days must be a non-negative integer", 400);
    }

    const from = parseDate(req.query.startDate, false);
    const to = parseDate(req.query.endDate, true);
    if (req.query.startDate && !from) {
      return errorResponse(res, "Invalid startDate", 400);
    }
    if (req.query.endDate && !to) {
      return errorResponse(res, "Invalid endDate", 400);
    }

    const [user, wallets, upcomingPlannedPayments] = await Promise.all([
      User.findById(userId)
        .populate(
          "defaultWalletId",
          "walletName slug description icon color currency sortOrder",
        )
        .populate("subscriptionId"),
      Wallet.find({ userId, isDeleted: false }),
      fetchPlannedPaymentOccurrences(userId, { days, occurrenceType: "UPCOMING" }),
    ]);

    if (!user || user.isDeleted) {
      return errorResponse(res, "User not found", 404);
    }

    const { wallets: selectedWallets, categories } = await syncUserSelectionsFromDb(userId);

    const userPayload = user.toObject();
    userPayload.selectedWallets = selectedWallets;
    userPayload.selectedCategories = categories;

    const [{ plan }, receiptRetentionInfo, warnings] = await Promise.all([
      getEffectivePlanForUser(userId),
      Promise.resolve(buildReceiptRetentionInfo(userPayload)),
      buildReceiptRetentionWarnings(userPayload),
    ]);

    const { showWarning, deletingDate } = receiptRetentionInfo;
    const receiptStorage = await buildReceiptStorageInfo(userId, plan);

    const orderedWallets = sortWalletsByEffectiveOrder(
      wallets,
      user.walletOrder ?? [],
    );
    userPayload.walletOrder = orderedWallets.map((w) => w.walletName);
    const walletIds = orderedWallets.map((w) => w._id);
    const balanceMap = await aggregateBalancesByWalletIds(userId, walletIds);

    const walletList = orderedWallets.map((w) => {
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

    const firstWallet = orderedWallets[0] ?? null;
    let firstWalletTransactions = {
      walletId: firstWallet?._id ?? null,
      items: [],
      pagination: {
        page,
        perPage,
        total: 0,
        totalPages: 1,
      },
    };

    if (firstWallet) {
      const txFilter = {
        userId,
        walletId: firstWallet._id,
        isDeleted: false,
      };

      if (from || to) {
        txFilter.transactionDate = {};
        if (from) {
          txFilter.transactionDate.$gte = from;
        }
        if (to) {
          txFilter.transactionDate.$lte = to;
        }
      }

      const [items, total] = await Promise.all([
        WalletTransaction.find(txFilter)
          .sort({ transactionDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(perPage)
          .populate("walletId", "walletName currency")
          .populate("categoryId", "name isDefault")
          .lean(),
        WalletTransaction.countDocuments(txFilter),
      ]);

      firstWalletTransactions = {
        walletId: firstWallet._id,
        items: items.map(normalizeTransactionReferences),
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage) || 1,
        },
      };
    }

    return successResponse(res, "Dashboard fetched successfully", {
      user: userPayload,
      plan,
      showWarning,
      deletingDate,
      receiptStorage,
      warnings,
      wallets: walletList,
      firstWalletTransactions,
      upcomingPlannedPayments,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  getDashboard,
};
