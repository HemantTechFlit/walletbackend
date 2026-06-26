const User = require("../models/User");
const Plan = require("../models/Plan");
const Wallet = require("../models/Wallet");
const Report = require("../models/Report");
const Subscription = require("../models/Subscription");
const {
  normalizePlanFeatures,
  toPlanFeatureSeed,
} = require("./planFeatures");

const BASIC_PLAN_NAME = "Basic";
const YEARLY_PREMIUM_PLAN_NAME = "Yearly Premium";
const YEARLY_PREMIUM_PLUS_PLAN_NAME = "Yearly Premium+";

const PLAN_DISPLAY_ORDER = [
  BASIC_PLAN_NAME,
  "Premium",
  "Premium+",
  YEARLY_PREMIUM_PLAN_NAME,
  YEARLY_PREMIUM_PLUS_PLAN_NAME,
];

const getStripePriceIdForPlan = (planName) => {
  const priceMap = {
    [BASIC_PLAN_NAME]: process.env.STRIPE_PRICE_BASIC,
    Premium: process.env.STRIPE_PRICE_PREMIUM,
    "Premium+": process.env.STRIPE_PRICE_PREMIUM_PLUS,
    [YEARLY_PREMIUM_PLAN_NAME]: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
    [YEARLY_PREMIUM_PLUS_PLAN_NAME]:
      process.env.STRIPE_PRICE_PREMIUM_PLUS_YEARLY,
  };

  return priceMap[planName] || null;
};

const getStripeProductIdForPlan = (planName) => {
  const productMap = {
    [BASIC_PLAN_NAME]: process.env.STRIPE_PRODUCT_BASIC,
    Premium: process.env.STRIPE_PRODUCT_PREMIUM,
    "Premium+": process.env.STRIPE_PRODUCT_PREMIUM_PLUS,
    [YEARLY_PREMIUM_PLAN_NAME]: process.env.STRIPE_PRODUCT_PREMIUM_YEARLY,
    [YEARLY_PREMIUM_PLUS_PLAN_NAME]:
      process.env.STRIPE_PRODUCT_PREMIUM_PLUS_YEARLY,
  };

  return productMap[planName] || null;
};

const getPlanTier = (plan) => {
  if (!plan) {
    return 0;
  }

  if (plan.name === BASIC_PLAN_NAME || Number(plan.price) === 0) {
    return 0;
  }

  if (plan.name === "Premium" || plan.name === YEARLY_PREMIUM_PLAN_NAME) {
    return 1;
  }

  if (plan.name === "Premium+" || plan.name === YEARLY_PREMIUM_PLUS_PLAN_NAME) {
    return 2;
  }

  return 0;
};

const isPlanUpgrade = (currentPlan, newPlan) => {
  const currentTier = getPlanTier(currentPlan);
  const newTier = getPlanTier(newPlan);

  if (newTier > currentTier) {
    return true;
  }

  if (newTier < currentTier) {
    return false;
  }

  return Number(newPlan?.price || 0) > Number(currentPlan?.price || 0);
};

const sortPlansForDisplay = (plans) =>
  [...plans].sort(
    (a, b) =>
      PLAN_DISPLAY_ORDER.indexOf(a.name) - PLAN_DISPLAY_ORDER.indexOf(b.name),
  );

const UNLIMITED_WALLETS = 999999;
const UNLIMITED_REPORTS = 999999;

const DEFAULT_PLANS = [
  {
    name: "Basic",
    price: 0,
    currency: "AUD",
    billingType: "LIFETIME",
    maxWallets: UNLIMITED_WALLETS,
    adsEnabled: true,
    monthlyReportLimit: 1,
    cloudStorageLimitMB: 0,
    features: [
      toPlanFeatureSeed("Ads enabled"),
      toPlanFeatureSeed("Unlimited Wallets"),
      toPlanFeatureSeed("No Receipt Upload"),
      toPlanFeatureSeed("1 Report a month"),
    ],
    isActive: true,
  },
  {
    name: "Premium",
    price: 3,
    currency: "AUD",
    billingType: "MONTHLY",
    maxWallets: UNLIMITED_WALLETS,
    adsEnabled: false,
    monthlyReportLimit: 5,
    cloudStorageLimitMB: 300,
    features: [
      toPlanFeatureSeed("No ADS"),
      toPlanFeatureSeed("Unlimited Wallets"),
      toPlanFeatureSeed("Receipt Upload"),
      toPlanFeatureSeed("300 MB Receipt Storage"),
      toPlanFeatureSeed("5 Reports a month"),
    ],
    isActive: true,
  },
  {
    name: "Premium+",
    price: 10,
    currency: "AUD",
    billingType: "MONTHLY",
    maxWallets: UNLIMITED_WALLETS,
    adsEnabled: false,
    monthlyReportLimit: UNLIMITED_REPORTS,
    cloudStorageLimitMB: 5120,
    features: [
      toPlanFeatureSeed("No ADS"),
      toPlanFeatureSeed("Unlimited Wallets"),
      toPlanFeatureSeed("Receipt Upload"),
      toPlanFeatureSeed("5 GB Receipt Storage"),
      toPlanFeatureSeed("Unlimited Reports"),
    ],
    isActive: true,
  },
  {
    name: YEARLY_PREMIUM_PLAN_NAME,
    price: 24,
    currency: "AUD",
    billingType: "YEARLY",
    maxWallets: UNLIMITED_WALLETS,
    adsEnabled: false,
    monthlyReportLimit: 5,
    cloudStorageLimitMB: 300,
    features: [
      toPlanFeatureSeed("No ADS"),
      toPlanFeatureSeed("Unlimited Wallets"),
      toPlanFeatureSeed("Receipt Upload"),
      toPlanFeatureSeed("300 MB Receipt Storage"),
      toPlanFeatureSeed("5 Reports a month"),
      toPlanFeatureSeed("Billed yearly"),
    ],
    isActive: true,
  },
  {
    name: YEARLY_PREMIUM_PLUS_PLAN_NAME,
    price: 60,
    currency: "AUD",
    billingType: "YEARLY",
    maxWallets: UNLIMITED_WALLETS,
    adsEnabled: false,
    monthlyReportLimit: UNLIMITED_REPORTS,
    cloudStorageLimitMB: 5120,
    features: [
      toPlanFeatureSeed("No ADS"),
      toPlanFeatureSeed("Unlimited Wallets"),
      toPlanFeatureSeed("Receipt Upload"),
      toPlanFeatureSeed("5 GB Receipt Storage"),
      toPlanFeatureSeed("Unlimited Reports"),
      toPlanFeatureSeed("Billed yearly"),
    ],
    isActive: true,
  },
];

const ACTIVE_PLAN_NAMES = DEFAULT_PLANS.map((plan) => plan.name);

const seedPlansIfEmpty = async () => {
  for (const planData of DEFAULT_PLANS) {
    const stripePriceId = getStripePriceIdForPlan(planData.name);
    const stripeProductId = getStripeProductIdForPlan(planData.name);
    const existing = await Plan.findOne({ name: planData.name }).select("_id");

    if (!existing) {
      await Plan.create({
        ...planData,
        ...(stripePriceId ? { stripePriceId } : {}),
        ...(stripeProductId ? { stripeProductId } : {}),
      });
      continue;
    }

    const stripeUpdates = {};

    if (stripePriceId) {
      stripeUpdates.stripePriceId = stripePriceId;
    }

    if (stripeProductId) {
      stripeUpdates.stripeProductId = stripeProductId;
    }

    if (Object.keys(stripeUpdates).length > 0) {
      await Plan.updateOne({ _id: existing._id }, { $set: stripeUpdates });
    }
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

const markReceiptRetentionOnBasic = async (
  userId,
  { basicEffectiveAt = null, session = null } = {},
) => {
  const {
    userHasStoredReceipts,
    RECEIPT_RETENTION_DAYS,
  } = require("./receiptUpload");

  const hasReceipts = await userHasStoredReceipts(userId, session);
  if (!hasReceipts) {
    return false;
  }

  const effectiveDate = basicEffectiveAt
    ? new Date(basicEffectiveAt)
    : new Date();
  const deletionDate = new Date(effectiveDate);
  deletionDate.setDate(deletionDate.getDate() + RECEIPT_RETENTION_DAYS);

  const update = {
    $set: {
      receiptDeletionScheduledAt: deletionDate,
      updatedAt: new Date(),
    },
  };

  if (effectiveDate.getTime() <= Date.now()) {
    update.$set.receiptRetentionStartedAt = effectiveDate;
  }

  const options = session ? { session } : {};
  await User.findByIdAndUpdate(userId, update, options);
  return true;
};

const markUserLandedOnBasicPlan = async (userId, session = null) => {
  const {
    userHasStoredReceipts,
    RECEIPT_RETENTION_DAYS,
  } = require("./receiptUpload");

  const options = session ? { session } : {};
  let query = User.findById(userId).select(
    "receiptDeletionScheduledAt receiptRetentionStartedAt",
  );
  if (session) {
    query = query.session(session);
  }
  const user = await query.lean();

  const now = new Date();
  const update = {
    $set: {
      receiptRetentionStartedAt: now,
      updatedAt: now,
    },
  };

  if (!user?.receiptDeletionScheduledAt) {
    const hasReceipts = await userHasStoredReceipts(userId, session);
    if (hasReceipts) {
      const deletionDate = new Date(now);
      deletionDate.setDate(deletionDate.getDate() + RECEIPT_RETENTION_DAYS);
      update.$set.receiptDeletionScheduledAt = deletionDate;
    }
  }

  await User.findByIdAndUpdate(userId, update, options);
  return Boolean(
    update.$set.receiptDeletionScheduledAt || user?.receiptDeletionScheduledAt,
  );
};

const clearReceiptRetention = async (userId, session = null) => {
  const update = {
    $set: {
      receiptRetentionStartedAt: null,
      receiptDeletionScheduledAt: null,
      updatedAt: new Date(),
    },
  };
  const options = session ? { session } : {};

  await User.findByIdAndUpdate(userId, update, options);
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
        stripePriceId:
          basicPlan.stripePriceId || getStripePriceIdForPlan(BASIC_PLAN_NAME),
        cancelAtPeriodEnd: false,
        status: "ACTIVE",
        updatedAt: start,
      },
    ],
    createOptions,
  );

  const userUpdate = {
    subscriptionId: subscription._id,
    updatedAt: new Date(),
  };
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
    const subscription = await Subscription.findById(
      user.subscriptionId,
    ).lean();
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

  const allPlans = sortPlansForDisplay(
    await Plan.find({ isActive: true }).lean(),
  );
  const plans = allPlans.map((item) => ({
    ...item,
    features: normalizePlanFeatures(item.features),
    selected: selectedPlanId ? item._id.toString() === selectedPlanId : false,
  }));

  let pendingPlan = null;
  if (subscription?.pendingPlanId) {
    pendingPlan = await Plan.findById(subscription.pendingPlanId).lean();
  }

  if (plan) {
    plan = {
      ...plan,
      features: normalizePlanFeatures(plan.features),
    };
  }

  if (pendingPlan) {
    pendingPlan = {
      ...pendingPlan,
      features: normalizePlanFeatures(pendingPlan.features),
    };
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

const assertCanCreateWallet = async () => {
  // All plans allow unlimited wallets.
};

const assertCanCreateReport = async (userId) => {
  const { plan } = await getEffectivePlanForUser(userId);
  if (!plan) {
    return;
  }

  if (plan.monthlyReportLimit >= UNLIMITED_REPORTS) {
    return;
  }

  const used = await countReportsThisMonth(userId);
  if (used >= plan.monthlyReportLimit) {
    const err = new Error(
      `Monthly report limit reached (${plan.monthlyReportLimit})`,
    );
    err.statusCode = 403;
    throw err;
  }
};

module.exports = {
  BASIC_PLAN_NAME,
  YEARLY_PREMIUM_PLAN_NAME,
  YEARLY_PREMIUM_PLUS_PLAN_NAME,
  PLAN_DISPLAY_ORDER,
  getStripePriceIdForPlan,
  getStripeProductIdForPlan,
  getPlanTier,
  isPlanUpgrade,
  sortPlansForDisplay,
  seedPlansIfEmpty,
  getBasicPlan,
  assignBasicPlanToUser,
  getEffectivePlanForUser,
  buildPlansCatalogForUser,
  UNLIMITED_WALLETS,
  UNLIMITED_REPORTS,
  markReceiptRetentionOnBasic,
  markUserLandedOnBasicPlan,
  clearReceiptRetention,
  assertCanCreateWallet,
  assertCanCreateReport,
  countUserWallets,
  countReportsThisMonth,
};
