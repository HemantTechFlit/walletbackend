const mongoose = require("mongoose");
const WalletTransaction = require("../models/WalletTransaction");

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const aggregateBalancesByWalletIds = async (userId, walletIds) => {
  const uid = toObjectId(userId);
  const match = { userId: uid, isDeleted: false };

  if (walletIds?.length) {
    match.walletId = { $in: walletIds.map((id) => toObjectId(id)) };
  }

  const rows = await WalletTransaction.aggregate([
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
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(row._id.toString(), {
      income: row.income,
      expense: row.expense,
      balance: row.income - row.expense,
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
