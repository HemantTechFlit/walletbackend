const mongoose = require("mongoose");

const PlannedPayment = require("../models/PlannedPayment");
const WalletTransaction = require("../models/WalletTransaction");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const {
  startOfDay,
  endOfDay,
  occurrenceKey,
  generateOccurrences,
  fetchPlannedPaymentOccurrences,
} = require("../utils/plannedPaymentOccurrences");

const REPEAT_UNITS = ["DAYS", "WEEKS", "MONTHS", "YEARS"];
const OCCURRENCE_TYPES = ["ALL", "UPCOMING", "OVERDUE"];
const DECISION_TYPES = ["ALL", "ACCEPTED", "DECLINED"];

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

  let resolvedCategoryId = null;
  if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
    if (!mongoose.isValidObjectId(categoryId)) {
      errorResponse(res, "Valid categoryId is required", 400);
      return null;
    }
    resolvedCategoryId = categoryId;
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
    resolvedCategoryId
      ? assertCategoryForUser(userId, resolvedCategoryId)
      : Promise.resolve(null),
  ]);

  if (!wallet) {
    errorResponse(res, "Wallet not found", 404);
    return null;
  }

  if (resolvedCategoryId && !category) {
    errorResponse(res, "Category not found", 404);
    return null;
  }

  return {
    userId,
    walletId: resolvedWalletId,
    categoryId: resolvedCategoryId,
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

const hasScheduleChanged = (existing, payload) => {
  if (existing.plannedType !== payload.plannedType) {
    return true;
  }

  if (
    startOfDay(existing.startDate).getTime() !== payload.startDate.getTime()
  ) {
    return true;
  }

  if (payload.plannedType === "REPEATED") {
    return (
      existing.repeatInterval !== payload.repeatInterval ||
      existing.repeatUnit !== payload.repeatUnit ||
      existing.repeatUntilTimes !== payload.repeatUntilTimes
    );
  }

  return false;
};

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

const formatPlannedPaymentRule = (plannedPayment) => {
  const doc = plannedPayment.toObject
    ? plannedPayment.toObject()
    : { ...plannedPayment };

  return {
    _id: doc._id,
    userId: doc.userId,
    walletId: doc.walletId,
    categoryId: doc.categoryId,
    type: doc.type,
    title: doc.title,
    amount: doc.amount,
    description: doc.description,
    plannedType: doc.plannedType,
    startDate: doc.startDate,
    repeatInterval: doc.repeatInterval,
    repeatUnit: doc.repeatUnit,
    repeatUntilTimes: doc.repeatUntilTimes,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const listPlannedPayments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const daysParam = req.query.days;

    const items = await PlannedPayment.find({
      userId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate("walletId", "walletName")
      .populate("categoryId", "name");

    const response = {
      items: items.map(formatPlannedPaymentRule),
      count: items.length,
    };

    if (daysParam !== undefined) {
      const days = Number(daysParam);

      if (!Number.isInteger(days) || days < 0) {
        return errorResponse(res, "days must be a non-negative integer", 400);
      }

      const upcoming = await fetchPlannedPaymentOccurrences(userId, {
        days,
        occurrenceType: "UPCOMING",
      });

      response.upcoming = upcoming.items;
      response.upcomingCount = upcoming.count;
    }

    return successResponse(res, "Planned payments fetched successfully", response);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updatePlannedPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid planned payment id", 400);
    }

    const existing = await PlannedPayment.findOne({
      _id: id,
      userId,
      isDeleted: false,
      status: "ACTIVE",
    });

    if (!existing) {
      return errorResponse(res, "Planned payment not found", 404);
    }

    const payload = await buildPlannedPaymentPayload(req, res);
    if (!payload) {
      return null;
    }

    const updateData = {
      walletId: payload.walletId,
      categoryId: payload.categoryId,
      type: payload.type,
      title: payload.title,
      amount: payload.amount,
      description: payload.description,
      plannedType: payload.plannedType,
      startDate: payload.startDate,
      repeatInterval: payload.repeatInterval,
      repeatUnit: payload.repeatUnit,
      repeatUntilTimes: payload.repeatUntilTimes,
      updatedAt: new Date(),
    };

    if (hasScheduleChanged(existing, payload)) {
      updateData.decisions = [];
    }

    const plannedPayment = await PlannedPayment.findOneAndUpdate(
      {
        _id: id,
        userId,
        isDeleted: false,
        status: "ACTIVE",
      },
      { $set: updateData },
      { new: true },
    )
      .populate("walletId", "walletName")
      .populate("categoryId", "name");

    return successResponse(res, "Planned payment updated successfully", plannedPayment);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deletePlannedPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid planned payment id", 400);
    }

    const plannedPayment = await PlannedPayment.findOneAndUpdate(
      {
        _id: id,
        userId: req.user.userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          status: "CANCELLED",
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!plannedPayment) {
      return errorResponse(res, "Planned payment not found", 404);
    }

    return successResponse(res, "Planned payment deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const listPlannedPaymentOccurrences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const days = Number(req.query.days);
    const occurrenceType = String(req.query.type || "ALL").toUpperCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    if (!Number.isInteger(days) || days < 0) {
      return errorResponse(res, "days must be a non-negative integer", 400);
    }

    if (!OCCURRENCE_TYPES.includes(occurrenceType)) {
      return errorResponse(res, "type must be ALL, UPCOMING or OVERDUE", 400);
    }

    const result = await fetchPlannedPaymentOccurrences(userId, {
      days,
      occurrenceType,
    });

    const total = result.count;

    return successResponse(res, "Planned payments fetched successfully", {
      items: result.items.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const listUpcomingPlannedPayments = async (req, res) => {
  req.query.type = "UPCOMING";
  return listPlannedPaymentOccurrences(req, res);
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

const applyOccurrenceDecision = async ({
  userId,
  plannedPaymentId,
  occurrenceDate,
  action,
  res,
  successMessage = "Planned payment occurrence updated successfully",
}) => {
  const session = await mongoose.startSession();
  const normalizedAction = String(action || "").trim().toUpperCase();

  try {
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
      _id: plannedPaymentId,
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
      const wallet = await assertOwnWallet(
        userId,
        plannedPayment.walletId,
        session,
      );

      if (!wallet) {
        await session.abortTransaction();
        return errorResponse(res, "Wallet not found", 404);
      }

      let category = null;
      if (plannedPayment.categoryId) {
        category = await assertCategoryForUser(
          userId,
          plannedPayment.categoryId,
          session,
        );

        if (!category) {
          await session.abortTransaction();
          return errorResponse(res, "Category not found", 404);
        }
      }

      const created = await WalletTransaction.create(
        [
          {
            userId,
            walletId: plannedPayment.walletId,
            categoryId: plannedPayment.categoryId ?? null,
            type: plannedPayment.type,
            amount: plannedPayment.amount,
            title: plannedPayment.title,
            description: plannedPayment.description,
            transactionDate: normalizedOccurrenceDate,
            categorySnapshot: category
              ? {
                  name: category.name,
                  color: category.color,
                  icon: category.icon,
                }
              : null,
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

    return successResponse(res, successMessage, {
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

const decidePlannedPaymentOccurrence = async (req, res) => {
  const { id } = req.params;
  const { occurrenceDate, action } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return errorResponse(res, "Invalid planned payment id", 400);
  }

  return applyOccurrenceDecision({
    userId: req.user.userId,
    plannedPaymentId: id,
    occurrenceDate,
    action,
    res,
  });
};

const deletePlannedPaymentOccurrence = async (req, res) => {
  const { id } = req.params;
  const { occurrenceDate } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return errorResponse(res, "Invalid planned payment id", 400);
  }

  return applyOccurrenceDecision({
    userId: req.user.userId,
    plannedPaymentId: id,
    occurrenceDate,
    action: "DECLINE",
    res,
    successMessage: "Planned payment occurrence deleted successfully",
  });
};

module.exports = {
  listPlannedPayments,
  listUpcomingPlannedPayments,
  createPlannedPayment,
  updatePlannedPayment,
  deletePlannedPayment,
  deletePlannedPaymentOccurrence,
  listPlannedPaymentOccurrences,
  listPlannedPaymentDecisions,
  decidePlannedPaymentOccurrence,
};
