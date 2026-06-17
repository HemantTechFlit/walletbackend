const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const aggregateBalancesByWalletIds = async (userId, walletIds) => {
  const uid = toObjectId(userId);
  const match = { userId: uid, isDeleted: false };
  const walletFilter = { userId: uid, isDeleted: false };

  if (walletIds?.length) {
    const ids = walletIds.map((id) => toObjectId(id));
    match.walletId = { $in: ids };
    walletFilter._id = { $in: ids };
  }

  const [wallets, rows] = await Promise.all([
    Wallet.find(walletFilter).select("incomeTotal expenseTotal balance").lean(),
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
    const fromTransactions = txMap.get(walletId);

    if (fromTransactions) {
      map.set(walletId, fromTransactions);
      continue;
    }

    // Legacy wallets created before transaction-based balances.
    const income = Number(wallet.incomeTotal) || 0;
    const expense = Number(wallet.expenseTotal) || 0;
    const storedBalance = Number(wallet.balance);
    const balance = Number.isNaN(storedBalance)
      ? income - expense
      : storedBalance;

    map.set(walletId, { income, expense, balance });
  }

  return map;
};

const getWalletBalance = async (userId, walletId) => {
  const map = await aggregateBalancesByWalletIds(userId, [walletId]);
  return map.get(walletId.toString()) ?? { income: 0, expense: 0, balance: 0 };
};

const INSUFFICIENT_BALANCE_MESSAGE =
  "Your wallet balance is less than the payment amount.";

const assertSufficientWalletBalance = async () => {
  // Wallets may go negative; no minimum balance enforcement.
};

module.exports = {
  aggregateBalancesByWalletIds,
  getWalletBalance,
  assertSufficientWalletBalance,
  INSUFFICIENT_BALANCE_MESSAGE,
};
