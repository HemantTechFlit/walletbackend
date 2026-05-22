const mongoose = require("mongoose");

const User = require("../models/User");
const Plan = require("../models/Plan");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const TransactionCategory = require("../models/TransactionCategory");
const Subscription = require("../models/Subscription");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertSufficientWalletBalance } = require("../utils/walletBalance");
const {
  seedPlansIfEmpty,
  buildPlansCatalogForUser,
  BASIC_PLAN_NAME,
} = require("../utils/planLimits");

const isFreePlan = (plan) => plan.name === BASIC_PLAN_NAME || plan.price === 0;

const SUBSCRIPTION_CATEGORY_NAME = "Subscription";

const getOrCreateSubscriptionCategory = async (userId, session) => {
  let category = await TransactionCategory.findOne({
    userId,
    name: SUBSCRIPTION_CATEGORY_NAME,
    isDeleted: false,
  }).session(session);

  if (!category) {
    const created = await TransactionCategory.create(
      [
        {
          userId,
          name: SUBSCRIPTION_CATEGORY_NAME,
          isDefault: false,
        },
      ],
      { session },
    );
    category = created[0];
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { selectedCategories: category._id } },
      { session },
    );
  }

  return category;
};

const computeEndDate = (plan) => {
  const start = new Date();
  const end = new Date(start);

  if (plan.billingType === "MONTHLY") {
    end.setMonth(end.getMonth() + 1);
  } else if (plan.billingType === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else if (plan.billingType === "LIFETIME") {
    end.setFullYear(end.getFullYear() + 100);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  return { start, end };
};

const getMySubscription = async (req, res) => {
  try {
    const { plans, plan, subscription } = await buildPlansCatalogForUser(
      req.user.userId,
    );

    return successResponse(res, "Subscription fetched successfully", {
      plans,
      plan,
      subscription,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const subscribe = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await seedPlansIfEmpty();
    const userId = req.user.userId;
    const { planId, walletId, paymentId = null, amountPaid = 0 } = req.body;

    if (!planId || !mongoose.isValidObjectId(planId)) {
      return errorResponse(res, "Valid planId is required", 400);
    }

    session.startTransaction();

    const plan = await Plan.findById(planId).session(session);
    if (!plan || !plan.isActive) {
      await session.abortTransaction();
      return errorResponse(res, "Plan not found", 404);
    }

    const freePlan = isFreePlan(plan);
    let paymentProvider = null;
    let paymentWallet = null;
    const paymentAmount = Number(amountPaid) || plan.price;

    if (!freePlan) {
      if (!walletId || !mongoose.isValidObjectId(walletId)) {
        await session.abortTransaction();
        return errorResponse(
          res,
          "walletId is required when upgrading to a paid plan",
          400,
        );
      }

      paymentWallet = await Wallet.findOne({
        _id: walletId,
        userId,
        isDeleted: false,
      }).session(session);

      if (!paymentWallet) {
        await session.abortTransaction();
        return errorResponse(res, "Payment wallet not found", 404);
      }

      try {
        await assertSufficientWalletBalance(userId, walletId, paymentAmount);
      } catch (error) {
        await session.abortTransaction();
        return errorResponse(res, error.message, error.statusCode || 400);
      }

      paymentProvider = paymentWallet.walletName;

      const category = await getOrCreateSubscriptionCategory(userId, session);
      const when = new Date();

      await WalletTransaction.create(
        [
          {
            userId,
            walletId,
            categoryId: category._id,
            type: "EXPENSE",
            amount: paymentAmount,
            title: `${plan.name} subscription`,
            description: `Plan upgrade to ${plan.name}`,
            transactionDate: when,
            categorySnapshot: { name: category.name },
            walletSnapshot: { walletName: paymentWallet.walletName },
            createdBy: userId,
          },
        ],
        { session },
      );
    }

    const { start, end } = computeEndDate(plan);

    await Subscription.updateMany(
      { userId, status: "ACTIVE" },
      { $set: { status: "CANCELLED" } },
      { session },
    );

    const subscription = await Subscription.create(
      [
        {
          userId,
          planId,
          startDate: start,
          endDate: end,
          paymentProvider,
          paymentId,
          amountPaid: paymentAmount,
          status: "ACTIVE",
        },
      ],
      { session },
    );

    const sub = subscription[0];

    await User.findByIdAndUpdate(
      userId,
      { $set: { subscriptionId: sub._id, updatedAt: new Date() } },
      { session },
    );

    await session.commitTransaction();

    const populated = await Subscription.findById(sub._id).populate("planId");

    return successResponse(res, "Subscription activated successfully", populated, 201);
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
  getMySubscription,
  subscribe,
};
