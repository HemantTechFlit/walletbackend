const WalletTransfer = require("../models/WalletTransfer");
const WalletTransaction = require("../models/WalletTransaction");

const parseBooleanFlag = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

const roundAmount = (value) => Math.round(Number(value) * 10000) / 10000;

const findTransferForTransaction = (userId, transactionId, session = null) => {
  let query = WalletTransfer.findOne({
    userId,
    $or: [
      { debitTransactionId: transactionId },
      { creditTransactionId: transactionId },
    ],
  });

  if (session) {
    query = query.session(session);
  }

  return query;
};

const getTransferLegRole = (transfer, transactionId) => {
  const txId = transactionId.toString();

  if (transfer.debitTransactionId?.toString() === txId) {
    return "debit";
  }

  if (transfer.creditTransactionId?.toString() === txId) {
    return "credit";
  }

  return null;
};

const getStoredTransferAmounts = (transfer) => {
  const fromAmount = Number(transfer.fromAmount ?? transfer.amount);
  const toAmount = Number(transfer.toAmount ?? transfer.amount);

  return { fromAmount, toAmount };
};

const convertCounterpartAmount = (transfer, role, amount) => {
  const { fromAmount, toAmount } = getStoredTransferAmounts(transfer);
  const parsedAmount = Number(amount);

  if (fromAmount === toAmount) {
    return parsedAmount;
  }

  if (role === "debit") {
    return roundAmount((parsedAmount * toAmount) / fromAmount);
  }

  return roundAmount((parsedAmount * fromAmount) / toAmount);
};

const loadTransferLegs = async (userId, transfer, session = null) => {
  let debitQuery = WalletTransaction.findOne({
    _id: transfer.debitTransactionId,
    userId,
    isDeleted: false,
  });
  let creditQuery = WalletTransaction.findOne({
    _id: transfer.creditTransactionId,
    userId,
    isDeleted: false,
  });

  if (session) {
    debitQuery = debitQuery.session(session);
    creditQuery = creditQuery.session(session);
  }

  const [debitTx, creditTx] = await Promise.all([debitQuery, creditQuery]);

  if (!debitTx || !creditTx) {
    const error = new Error("Linked transfer transactions not found");
    error.statusCode = 404;
    throw error;
  }

  return { debitTx, creditTx };
};

module.exports = {
  parseBooleanFlag,
  findTransferForTransaction,
  getTransferLegRole,
  convertCounterpartAmount,
  loadTransferLegs,
};
