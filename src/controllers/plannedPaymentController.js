const mongoose = require("mongoose");

const PlannedPayment = require("../models/PlannedPayment");
const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertSufficientWalletBalance } = require("../utils/walletBalance");

const REPEAT_UNITS = ["DAYS", "WEEKS", "MONTHS", "YEARS"];
const OCCURRENCE_TYPES = ["ALL", "UPCOMING", "OVERDUE"];
const DECISION_TYPES = ["ALL", "ACCEPTED", "DECLINED"];

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const padDatePart = (value) => String(value).padStart(2, "0");

const occurrenceKey = (date) => {
  const d = startOfDay(date);
  return [
    d.getFullYear(),
    padDatePart(d.getMonth() + 1),
    padDatePart(d.getDate()),
  ].join("-");
};

const addRepeatInterval = (date, interval, unit) => {
  const next = new Date(date);

  if (unit === "DAYS") {
    next.setDate(next.getDate() + interval);
  } else if (unit === "WEEKS") {
    next.setDate(next.getDate() + interval * 7);
  } else if (unit === "MONTHS") {
    next.setMonth(next.getMonth() + interval);
  } else if (unit === "YEARS") {
    next.setFullYear(next.getFullYear() + interval);
  }

  return next;
};

const normalizePlannedType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "ONE_TIME" || normalized === "REPEATED"
    ? normalized
    : null;
};

const normalizeTransactionType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "INCOME" || normalized === "EXPENSE" ? normalized : null;
};

const normalizeRepeatUnit = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  const pluralized = normalized.endsWith("S") ? normalized : `${normalized}S`;
  return REPEAT_UNITS.includes(pluralized) ? pluralized : null;
};

const assertOwnWallet = (userId, walletId, session = null) => {
  const query = Wallet.findOne({ _id: walletId, userId, isDeleted: false });
  return session ? query.session(session) : query;
};

const assertCategoryForUser = (userId, categoryId, session = null) => {
  const query = TransactionCategory.findOne({
    _id: categoryId,
    userId,
    isDeleted: false,
  });
  return session ? query.session(session) : query;
};

const resolveWalletId = async (userId, walletId) => {
  if (walletId) {
    return walletId;
  }

  const user = await User.findById(userId).select("defaultWalletId");
  return user?.defaultWalletId;
};

const buildPlannedPaymentPayload = async (req, res) => {
  const userId = req.user.userId;
  const {
    walletId,
    categoryId,
    type,
    title,
    amount,
    description,
    plannedType,
    startDate,
    repeatInterval,
    repeatUnit,
    repeatUntilTimes,
  } = req.body;

  const resolvedWalletId = await resolveWalletId(userId, walletId);

  if (!resolvedWalletId || !mongoose.isValidObjectId(resolvedWalletId)) {
    errorResponse(res, "Valid walletId or default wallet is required", 400);
    return null;
  }

  if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
    errorResponse(res, "Valid categoryId is required", 400);
    return null;
  }

  const normalizedType = normalizeTransactionType(type);
  if (!normalizedType) {
    errorResponse(res, "type must be INCOME or EXPENSE", 400);
    return null;
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    errorResponse(res, "title is required", 400);
    return null;
  }

  const amt = Number(amount);
  if (amount === undefined || amt <= 0 || Number.isNaN(amt)) {
    errorResponse(res, "amount must be a positive number", 400);
    return null;
  }

  const normalizedPlannedType = normalizePlannedType(plannedType);
  if (!normalizedPlannedType) {
    errorResponse(res, "plannedType must be ONE_TIME or REPEATED", 400);
    return null;
  }

  const parsedStartDate = parseDate(startDate);
  if (!parsedStartDate) {
    errorResponse(res, "Valid startDate is required", 400);
    return null;
  }

  let parsedRepeatInterval = null;
  let parsedRepeatUnit = null;
  let parsedRepeatUntilTimes = null;

  if (normalizedPlannedType === "REPEATED") {
    parsedRepeatInterval = Number(repeatInterval);
    parsedRepeatUnit = normalizeRepeatUnit(repeatUnit);
    parsedRepeatUntilTimes = Number(repeatUntilTimes);

    if (
      !Number.isInteger(parsedRepeatInterval) ||
      parsedRepeatInterval < 1
    ) {
      errorResponse(res, "repeatInterval must be a positive integer", 400);
      return null;
    }

    if (!parsedRepeatUnit) {
      errorResponse(res, "repeatUnit must be DAYS, WEEKS, MONTHS or YEARS", 400);
      return null;
    }

    if (
      !Number.isInteger(parsedRepeatUntilTimes) ||
      parsedRepeatUntilTimes < 1
    ) {
      errorResponse(res, "repeatUntilTimes must be a positive integer", 400);
      return null;
    }
  }

  const [wallet, category] = await Promise.all([
    assertOwnWallet(userId, resolvedWalletId),
    assertCategoryForUser(userId, categoryId),
  ]);

  if (!wallet) {
    errorResponse(res, "Wallet not found", 404);
    return null;
  }

  if (!category) {
    errorResponse(res, "Category not found", 404);
    return null;
  }

  return {
    userId,
    walletId: resolvedWalletId,
    categoryId,
    type: normalizedType,
    title: title.trim(),
    amount: amt,
    description: description ?? null,
    plannedType: normalizedPlannedType,
    startDate: startOfDay(parsedStartDate),
    repeatInterval: parsedRepeatInterval,
    repeatUnit: parsedRepeatUnit,
    repeatUntilTimes:
      normalizedPlannedType === "ONE_TIME" ? 1 : parsedRepeatUntilTimes,
  };
};

const generateOccurrences = (plannedPayment, today, rangeEnd, includeOverdue) => {
  const decisions = new Map();
  (plannedPayment.decisions || []).forEach((decision) => {
    decisions.set(decision.occurrenceKey, decision);

    if (decision.occurrenceDate) {
      decisions.set(occurrenceKey(decision.occurrenceDate), decision);
    }
  });

  const totalOccurrences =
    plannedPayment.plannedType === "ONE_TIME"
      ? 1
      : plannedPayment.repeatUntilTimes;

  const occurrences = [];
  let current = startOfDay(plannedPayment.startDate);

  for (let index = 1; index <= totalOccurrences; index += 1) {
    const key = occurrenceKey(current);
    const decision = decisions.get(key);

    if (!decision) {
      const occurrenceDate = startOfDay(current);
      const isOverdue = occurrenceDate < today;
      const isUpcoming = occurrenceDate >= today && occurrenceDate <= rangeEnd;

      if ((includeOverdue && isOverdue) || isUpcoming) {
        occurrences.push({
          plannedPayment,
          occurrence: {
            occurrenceKey: key,
            occurrenceNumber: index,
            occurrenceDate,
            status: isOverdue ? "OVERDUE" : "UPCOMING",
          },
        });
      }
    }

    if (plannedPayment.plannedType === "ONE_TIME") {
      break;
    }

    current = addRepeatInterval(
      current,
      plannedPayment.repeatInterval,
      plannedPayment.repeatUnit,
    );
  }

  return occurrences;
};

const formatOccurrence = ({ plannedPayment, occurrence }) => ({
  _id: plannedPayment._id,
  plannedPaymentId: plannedPayment._id,
  occurrenceKey: occurrence.occurrenceKey,
  occurrenceNumber: occurrence.occurrenceNumber,
  occurrenceDate: occurrence.occurrenceDate,
  status: occurrence.status,
  type: plannedPayment.type,
  title: plannedPayment.title,
  amount: plannedPayment.amount,
  description: plannedPayment.description,
  plannedType: plannedPayment.plannedType,
  startDate: plannedPayment.startDate,
  repeatInterval: plannedPayment.repeatInterval,
  repeatUnit: plannedPayment.repeatUnit,
  repeatUntilTimes: plannedPayment.repeatUntilTimes,
  walletId: plannedPayment.walletId,
  categoryId: plannedPayment.categoryId,
});

const formatDecision = ({ plannedPayment, decision }) => ({
  _id: `${plannedPayment._id}:${decision.occurrenceKey}`,
  plannedPaymentId: plannedPayment._id,
  occurrenceKey: decision.occurrenceKey,
  occurrenceDate: decision.occurrenceDate,
  status: decision.status,
  decidedAt: decision.decidedAt,
  type: plannedPayment.type,
  title: plannedPayment.title,
  amount: plannedPayment.amount,
  description: plannedPayment.description,
  plannedType: plannedPayment.plannedType,
  startDate: plannedPayment.startDate,
  repeatInterval: plannedPayment.repeatInterval,
  repeatUnit: plannedPayment.repeatUnit,
  repeatUntilTimes: plannedPayment.repeatUntilTimes,
  walletId: plannedPayment.walletId,
  categoryId: plannedPayment.categoryId,
  transaction: decision.transactionId || null,
});

const createPlannedPayment = async (req, res) => {
  try {
    const payload = await buildPlannedPaymentPayload(req, res);
    if (!payload) {
      return null;
    }

    const plannedPayment = await PlannedPayment.create(payload);
    const populated = await PlannedPayment.findById(plannedPayment._id)
      .populate("walletId", "walletName")
      .populate("categoryId", "name");

    return successResponse(res, "Planned payment created successfully", populated, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const listPlannedPaymentOccurrences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const days = Number(req.query.days);
    const occurrenceType = String(req.query.type || "ALL").toUpperCase();

    if (!Number.isInteger(days) || days < 0) {
      return errorResponse(res, "days must be a non-negative integer", 400);
    }

    if (!OCCURRENCE_TYPES.includes(occurrenceType)) {
      return errorResponse(res, "type must be ALL, UPCOMING or OVERDUE", 400);
    }

    const today = startOfDay(new Date());
    const rangeEnd = endOfDay(today);
    rangeEnd.setDate(rangeEnd.getDate() + days);

    const plannedPayments = await PlannedPayment.find({
      userId,
      status: "ACTIVE",
      isDeleted: false,
      startDate: { $lte: rangeEnd },
    })
      .populate("walletId", "walletName")
      .populate("categoryId", "name")
      .lean();

    const includeOverdue =
      occurrenceType === "ALL" || occurrenceType === "OVERDUE";

    let items = plannedPayments.flatMap((plannedPayment) =>
      generateOccurrences(plannedPayment, today, rangeEnd, includeOverdue),
    );

    if (occurrenceType !== "ALL") {
      items = items.filter(
        (item) => item.occurrence.status === occurrenceType,
      );
    }

    items.sort(
      (a, b) =>
        a.occurrence.occurrenceDate.getTime() -
        b.occurrence.occurrenceDate.getTime(),
    );

    return successResponse(res, "Planned payments fetched successfully", {
      items: items.map(formatOccurrence),
      count: items.length,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const listPlannedPaymentDecisions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const decisionType = String(req.query.status || "ALL").toUpperCase();
    const plannedPaymentId = req.query.plannedPaymentId;

    if (!DECISION_TYPES.includes(decisionType)) {
      return errorResponse(res, "status must be ALL, ACCEPTED or DECLINED", 400);
    }

    if (plannedPaymentId && !mongoose.isValidObjectId(plannedPaymentId)) {
      return errorResponse(res, "Invalid plannedPaymentId", 400);
    }

    const query = {
      userId,
      isDeleted: false,
      decisions: { $exists: true, $ne: [] },
    };

    if (plannedPaymentId) {
      query._id = plannedPaymentId;
    }

    const plannedPayments = await PlannedPayment.find(query)
      .populate("walletId", "walletName")
      .populate("categoryId", "name")
      .populate({
        path: "decisions.transactionId",
        populate: [
          { path: "walletId", select: "walletName" },
          { path: "categoryId", select: "name" },
        ],
      })
      .lean();

    let items = plannedPayments.flatMap((plannedPayment) =>
      (plannedPayment.decisions || []).map((decision) => ({
        plannedPayment,
        decision,
      })),
    );

    if (decisionType !== "ALL") {
      items = items.filter((item) => item.decision.status === decisionType);
    }

    items.sort(
      (a, b) =>
        new Date(b.decision.decidedAt).getTime() -
        new Date(a.decision.decidedAt).getTime(),
    );

    return successResponse(res, "Planned payment decisions fetched successfully", {
      items: items.map(formatDecision),
      count: items.length,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const decidePlannedPaymentOccurrence = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { occurrenceDate, action } = req.body;
    const normalizedAction = String(action || "").trim().toUpperCase();

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid planned payment id", 400);
    }

    if (!["ACCEPT", "DECLINE"].includes(normalizedAction)) {
      return errorResponse(res, "action must be ACCEPT or DECLINE", 400);
    }

    const parsedOccurrenceDate = parseDate(occurrenceDate);
    if (!parsedOccurrenceDate) {
      return errorResponse(res, "Valid occurrenceDate is required", 400);
    }

    const key = occurrenceKey(parsedOccurrenceDate);
    const normalizedOccurrenceDate = startOfDay(parsedOccurrenceDate);

    session.startTransaction();

    const plannedPayment = await PlannedPayment.findOne({
      _id: id,
      userId,
      status: "ACTIVE",
      isDeleted: false,
    }).session(session);

    if (!plannedPayment) {
      await session.abortTransaction();
      return errorResponse(res, "Planned payment not found", 404);
    }

    const alreadyDecided = (plannedPayment.decisions || []).find(
      (decision) =>
        decision.occurrenceKey === key ||
        (decision.occurrenceDate &&
          occurrenceKey(decision.occurrenceDate) === key),
    );

    if (alreadyDecided) {
      await session.abortTransaction();
      return errorResponse(res, "Occurrence already decided", 400);
    }

    const validOccurrence = generateOccurrences(
      plannedPayment.toObject(),
      startOfDay(new Date(0)),
      endOfDay(normalizedOccurrenceDate),
      true,
    ).find((item) => item.occurrence.occurrenceKey === key);

    if (!validOccurrence) {
      await session.abortTransaction();
      return errorResponse(res, "Occurrence does not exist for this planned payment", 400);
    }

    let transaction = null;

    if (normalizedAction === "ACCEPT") {
      const [wallet, category] = await Promise.all([
        assertOwnWallet(userId, plannedPayment.walletId, session),
        assertCategoryForUser(userId, plannedPayment.categoryId, session),
      ]);

      if (!wallet) {
        await session.abortTransaction();
        return errorResponse(res, "Wallet not found", 404);
      }

      if (!category) {
        await session.abortTransaction();
        return errorResponse(res, "Category not found", 404);
      }

      if (plannedPayment.type === "EXPENSE") {
        try {
          await assertSufficientWalletBalance(
            userId,
            plannedPayment.walletId,
            plannedPayment.amount,
          );
        } catch (error) {
          await session.abortTransaction();
          return errorResponse(res, error.message, error.statusCode || 400);
        }
      }

      const created = await WalletTransaction.create(
        [
          {
            userId,
            walletId: plannedPayment.walletId,
            categoryId: plannedPayment.categoryId,
            type: plannedPayment.type,
            amount: plannedPayment.amount,
            title: plannedPayment.title,
            description: plannedPayment.description,
            transactionDate: normalizedOccurrenceDate,
            categorySnapshot: {
              name: category.name,
              color: category.color,
              icon: category.icon,
            },
            walletSnapshot: {
              walletName: wallet.walletName,
              walletColor: wallet.color,
            },
            createdBy: userId,
          },
        ],
        { session },
      );

      transaction = created[0];
    }

    const decisionStatus =
      normalizedAction === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    const decisionUpdate = await PlannedPayment.updateOne(
      {
        _id: plannedPayment._id,
        userId,
        decisions: {
          $not: {
            $elemMatch: {
              occurrenceKey: key,
            },
          },
        },
      },
      {
        $push: {
          decisions: {
            occurrenceKey: key,
            occurrenceDate: normalizedOccurrenceDate,
            status: decisionStatus,
            transactionId: transaction?._id ?? null,
            decidedAt: new Date(),
          },
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { session },
    );

    if (decisionUpdate.modifiedCount !== 1) {
      await session.abortTransaction();
      return errorResponse(res, "Occurrence already decided", 400);
    }

    await session.commitTransaction();

    const populatedTransaction = transaction
      ? await WalletTransaction.findById(transaction._id)
          .populate("walletId", "walletName")
          .populate("categoryId", "name")
      : null;

    return successResponse(res, "Planned payment occurrence updated successfully", {
      plannedPaymentId: plannedPayment._id,
      occurrenceKey: key,
      status: decisionStatus,
      transaction: populatedTransaction,
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

module.exports = {
  createPlannedPayment,
  listPlannedPaymentOccurrences,
  listPlannedPaymentDecisions,
  decidePlannedPaymentOccurrence,
};
