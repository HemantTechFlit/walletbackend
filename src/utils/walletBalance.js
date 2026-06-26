const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const ACTIVE_TRANSACTION_FILTER = {
  isDeleted: { $ne: true },
};

const aggregateBalancesByWalletIds = async (userId, walletIds) => {
  const uid = toObjectId(userId);
  const match = {
    userId: uid,
    ...ACTIVE_TRANSACTION_FILTER,
  };
  const walletFilter = { userId: uid, isDeleted: false };

  if (walletIds?.length) {
    const ids = walletIds.map((id) => toObjectId(id));
    match.walletId = { $in: ids };
    walletFilter._id = { $in: ids };
  }

  const [wallets, rows] = await Promise.all([
    Wallet.find(walletFilter).select("_id").lean(),
    WalletTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$walletId",
          income: {
            $sum: {
              $cond: [{ $eq: ["$type", "INCOME"] }, "$amount", 0],
            },
          },
          expense: {
            $sum: {
              $cond: [{ $eq: ["$type", "EXPENSE"] }, "$amount", 0],
            },
          },
        },
      },
    ]),
  ]);

  const txMap = new Map();
  for (const row of rows) {
    if (!row._id) {
      continue;
    }

    const walletId = row._id.toString();
    txMap.set(walletId, {
      income: row.income,
      expense: row.expense,
      balance: row.income - row.expense,
    });
  }

  const map = new Map();
  for (const wallet of wallets) {
    const walletId = wallet._id.toString();
    map.set(
      walletId,
      txMap.get(walletId) ?? { income: 0, expense: 0, balance: 0 },
    );
  }

  return map;
};

const getWalletBalance = async (userId, walletId) => {
  const map = await aggregateBalancesByWalletIds(userId, [walletId]);
  return map.get(walletId.toString()) ?? { income: 0, expense: 0, balance: 0 };
};

const formatWalletBalancePayload = async (userId, walletIds) => {
  const uniqueWalletIds = [...new Set(walletIds.filter(Boolean))];

  if (!uniqueWalletIds.length) {
    return [];
  }

  const [wallets, balanceMap] = await Promise.all([
    Wallet.find({
      _id: { $in: uniqueWalletIds },
      userId,
      isDeleted: false,
    })
      .select("walletName currency color")
      .lean(),
    aggregateBalancesByWalletIds(userId, uniqueWalletIds),
  ]);

  return wallets.map((wallet) => {
    const walletId = wallet._id.toString();
    const balance = balanceMap.get(walletId) ?? {
      income: 0,
      expense: 0,
      balance: 0,
    };

    return {
      id: wallet._id,
      walletName: wallet.walletName,
      currency: wallet.currency,
      color: wallet.color,
      incomeTotal: balance.income,
      expenseTotal: balance.expense,
      balance: balance.balance,
    };
  });
};

const INSUFFICIENT_BALANCE_MESSAGE =
  "Your wallet balance is less than the payment amount.";

const assertSufficientWalletBalance = async () => {
  // Wallets may go negative; no minimum balance enforcement.
};

module.exports = {
  ACTIVE_TRANSACTION_FILTER,
  aggregateBalancesByWalletIds,
  getWalletBalance,
  formatWalletBalancePayload,
  assertSufficientWalletBalance,
  INSUFFICIENT_BALANCE_MESSAGE,
};
