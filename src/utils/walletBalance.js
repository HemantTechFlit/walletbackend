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

  const map = new Map();
  for (const wallet of wallets) {
    const income = Number(wallet.incomeTotal) || 0;
    const expense = Number(wallet.expenseTotal) || 0;
    const storedBalance = Number(wallet.balance);
    const balance = Number.isNaN(storedBalance)
      ? income - expense
      : storedBalance;

    map.set(wallet._id.toString(), {
      income,
      expense,
      balance,
    });
  }

  for (const row of rows) {
    const walletId = row._id.toString();
    const current = map.get(walletId) ?? {
      income: 0,
      expense: 0,
      balance: 0,
    };

    map.set(walletId, {
      income: current.income + row.income,
      expense: current.expense + row.expense,
      balance: current.balance + row.income - row.expense,
    });
  }

  return map;
};

const getWalletBalance = async (userId, walletId) => {
  const map = await aggregateBalancesByWalletIds(userId, [walletId]);
  return map.get(walletId.toString()) ?? { income: 0, expense: 0, balance: 0 };
};

const INSUFFICIENT_BALANCE_MESSAGE =
  "Your wallet balance is less than the payment amount.";

const assertSufficientWalletBalance = async (userId, walletId, amount) => {
  const paymentAmount = Number(amount);
  if (paymentAmount <= 0 || Number.isNaN(paymentAmount)) {
    return;
  }

  const { balance } = await getWalletBalance(userId, walletId);
  if (balance < paymentAmount) {
    const err = new Error(INSUFFICIENT_BALANCE_MESSAGE);
    err.statusCode = 400;
    throw err;
  }
};

module.exports = {
  aggregateBalancesByWalletIds,
  getWalletBalance,
  assertSufficientWalletBalance,
  INSUFFICIENT_BALANCE_MESSAGE,
};
