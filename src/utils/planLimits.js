const User = require("../models/User");
const Plan = require("../models/Plan");
const Wallet = require("../models/Wallet");
const Report = require("../models/Report");
const Subscription = require("../models/Subscription");

const BASIC_PLAN_NAME = "Basic";

const getStripePriceIdForPlan = (planName) => {
  if (planName === "Premium") {
    return process.env.STRIPE_PRICE_PREMIUM || null;
  }

  if (planName === "Premium+") {
    return process.env.STRIPE_PRICE_PREMIUM_PLUS || null;
  }

  return null;
};

const DEFAULT_PLANS = [
  {
    name: "Basic",
    price: 0,
    currency: "AUD",
    billingType: "LIFETIME",
    maxWallets: 2,
    adsEnabled: true,
    monthlyReportLimit: 1,
    cloudStorageLimitMB: 0,
    features: [
      "Ads enabled",
      "2 Wallets",
      "No Receipt Upload",
      "1 Report a month",
    ],
    isActive: true,
  },
  {
    name: "Premium",
    price: 2,
    currency: "AUD",
    billingType: "MONTHLY",
    maxWallets: 10,
    adsEnabled: false,
    monthlyReportLimit: 9999,
    cloudStorageLimitMB: 1024,
    features: [
      "No ADS",
      "10 Wallets",
      "Receipt Upload",
      "1 GB Receipt Storage",
      "Unlimited Reports",
    ],
    isActive: true,
  },
  {
    name: "Premium+",
    price: 5,
    currency: "AUD",
    billingType: "MONTHLY",
    maxWallets: 9999,
    adsEnabled: false,
    monthlyReportLimit: 9999,
    cloudStorageLimitMB: 999999,
    features: [
      "No ADS",
      "Unlimited Wallets",
      "Receipt Upload",
      "Unlimited Receipt Storage",
      "Unlimited Reports",
    ],
    isActive: true,
  },
];

const ACTIVE_PLAN_NAMES = DEFAULT_PLANS.map((plan) => plan.name);

const seedPlansIfEmpty = async () => {
  for (const planData of DEFAULT_PLANS) {
    const stripePriceId = getStripePriceIdForPlan(planData.name);
    await Plan.findOneAndUpdate(
      { name: planData.name },
      {
        $set: {
          ...planData,
          ...(stripePriceId ? { stripePriceId } : {}),
        },
      },
      { upsert: true },
    );
  }

  await Plan.updateMany(
    { name: { $nin: ACTIVE_PLAN_NAMES } },
    { $set: { isActive: false } },
  );
};

const getBasicPlan = async (session = null) => {
  await seedPlansIfEmpty();

  let query = Plan.findOne({ name: BASIC_PLAN_NAME, isActive: true });
  if (session) {
    query = query.session(session);
  }

  const plan = await query;
  if (!plan) {
    throw new Error("Basic plan is not configured");
  }

  return plan;
};

const assignBasicPlanToUser = async (userId, session = null) => {
  const basicPlan = await getBasicPlan(session);
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 100);

  const cancelFilter = { userId, status: { $in: ["ACTIVE", "PAST_DUE"] } };
  const cancelUpdate = { $set: { status: "CANCELLED", updatedAt: new Date() } };

  if (session) {
    await Subscription.updateMany(cancelFilter, cancelUpdate, { session });
  } else {
    await Subscription.updateMany(cancelFilter, cancelUpdate);
  }

  const createOptions = session ? { session } : {};
  const [subscription] = await Subscription.create(
    [
      {
        userId,
        planId: basicPlan._id,
        pendingPlanId: null,
        startDate: start,
        endDate: end,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        amountPaid: 0,
        paymentProvider: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
        stripePriceId: null,
        cancelAtPeriodEnd: false,
        status: "ACTIVE",
        updatedAt: start,
      },
    ],
    createOptions,
  );

  const userUpdate = { subscriptionId: subscription._id, updatedAt: new Date() };
  if (session) {
    await User.findByIdAndUpdate(userId, { $set: userUpdate }, { session });
  } else {
    await User.findByIdAndUpdate(userId, { $set: userUpdate });
  }

  return {
    plan: basicPlan.toObject(),
    subscription: subscription.toObject(),
  };
};

const getEffectivePlanForUser = async (userId) => {
  await seedPlansIfEmpty();

  const user = await User.findById(userId).lean();
  if (!user) {
    return { plan: null, subscription: null };
  }

  if (user.subscriptionId) {
    const subscription = await Subscription.findById(user.subscriptionId).lean();
    if (subscription && ["ACTIVE", "PAST_DUE"].includes(subscription.status)) {
      const plan = await Plan.findById(subscription.planId).lean();
      if (plan?.isActive) {
        return { plan, subscription };
      }
    }
  }

  return assignBasicPlanToUser(userId);
};

/** All active plans; marks the user's current plan with selected: true */
const buildPlansCatalogForUser = async (userId = null) => {
  await seedPlansIfEmpty();

  let selectedPlanId = null;
  let plan = null;
  let subscription = null;

  if (userId) {
    const effective = await getEffectivePlanForUser(userId);
    plan = effective.plan;
    subscription = effective.subscription;
    selectedPlanId = plan?._id?.toString() || null;
  }

  const allPlans = await Plan.find({ isActive: true }).sort({ price: 1 }).lean();
  const plans = allPlans.map((item) => ({
    ...item,
    selected: selectedPlanId ? item._id.toString() === selectedPlanId : false,
  }));

  let pendingPlan = null;
  if (subscription?.pendingPlanId) {
    pendingPlan = await Plan.findById(subscription.pendingPlanId).lean();
  }

  return {
    plans,
    plan,
    subscription,
    pendingPlan,
    selectedPlanId,
    walletCount: userId ? await countUserWallets(userId) : 0,
  };
};

const countUserWallets = async (userId) => {
  return Wallet.countDocuments({
    userId,
    isDeleted: false,
  });
};

const countReportsThisMonth = async (userId) => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return Report.countDocuments({
    userId,
    generatedAt: { $gte: start },
  });
};

const assertCanCreateWallet = async (userId) => {
  const { plan } = await getEffectivePlanForUser(userId);
  if (!plan) {
    return;
  }

  const current = await countUserWallets(userId);
  if (current >= plan.maxWallets) {
    const limitLabel =
      plan.maxWallets >= 9999 ? "unlimited" : String(plan.maxWallets);
    const err = new Error(
      `Wallet limit reached for your plan (${limitLabel})`,
    );
    err.statusCode = 403;
    throw err;
  }
};

const assertCanCreateReport = async (userId) => {
  const { plan } = await getEffectivePlanForUser(userId);
  if (!plan) {
    return;
  }

  // const used = await countReportsThisMonth(userId);
  // if (used >= plan.monthlyReportLimit) {
  //   const err = new Error(`Monthly report limit reached (${plan.monthlyReportLimit})`);
  //   err.statusCode = 403;
  //   throw err;
  // }
};

module.exports = {
  BASIC_PLAN_NAME,
  seedPlansIfEmpty,
  getBasicPlan,
  assignBasicPlanToUser,
  getEffectivePlanForUser,
  buildPlansCatalogForUser,
  assertCanCreateWallet,
  assertCanCreateReport,
  countUserWallets,
};
