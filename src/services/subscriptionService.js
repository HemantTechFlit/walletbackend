const mongoose = require("mongoose");

const User = require("../models/User");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const { getStripeClient, getCheckoutUrls } = require("../utils/stripe");
const {
  BASIC_PLAN_NAME,
  seedPlansIfEmpty,
  getBasicPlan,
  assignBasicPlanToUser,
  isPlanUpgrade,
  markReceiptRetentionOnBasic,
  markUserLandedOnBasicPlan,
  clearReceiptRetention,
} = require("../utils/planLimits");
const { recalculateUserReceiptStorage } = require("../utils/receiptUpload");

const STRIPE_PROVIDER = "stripe";

const isFreePlan = (plan) =>
  !plan || plan.name === BASIC_PLAN_NAME || Number(plan.price) === 0;

const toDate = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getStripePeriodStart = (stripeSub) =>
  toDate(stripeSub?.current_period_start) ||
  toDate(stripeSub?.items?.data?.[0]?.current_period_start) ||
  null;

const getStripePeriodEnd = (stripeSub) =>
  toDate(stripeSub?.current_period_end) ||
  toDate(stripeSub?.items?.data?.[0]?.current_period_end) ||
  toDate(stripeSub?.cancel_at) ||
  null;

const findPlanByStripePriceId = async (stripePriceId) => {
  if (!stripePriceId) {
    return null;
  }

  await seedPlansIfEmpty();
  return Plan.findOne({ stripePriceId, isActive: true }).lean();
};

const getPlanById = async (planId) => {
  if (!planId || !mongoose.isValidObjectId(planId)) {
    return null;
  }

  await seedPlansIfEmpty();
  return Plan.findById(planId).lean();
};

const assertPlanHasStripePrice = (plan) => {
  if (!plan?.stripePriceId) {
    const err = new Error(
      `Stripe price is not configured for the ${plan?.name || "selected"} plan`,
    );
    err.statusCode = 503;
    throw err;
  }
};

const getOrCreateStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.fullName,
    metadata: {
      userId: user._id.toString(),
    },
  });

  await User.findByIdAndUpdate(user._id, {
    $set: {
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    },
  });

  return customer.id;
};

const cancelActiveSubscriptionsForUser = async (userId, session = null) => {
  const filter = { userId, status: { $in: ["ACTIVE", "PAST_DUE"] } };
  const update = { $set: { status: "CANCELLED", updatedAt: new Date() } };
  const options = session ? { session } : {};

  await Subscription.updateMany(filter, update, options);
};

const upsertSubscriptionRecord = async ({
  userId,
  plan,
  stripeSubscription,
  session = null,
}) => {
  const stripeSub = stripeSubscription;
  const stripeItem = stripeSub.items?.data?.[0];
  const startDate = getStripePeriodStart(stripeSub) || new Date();
  const endDate = getStripePeriodEnd(stripeSub) || startDate;
  const now = new Date();

  await cancelActiveSubscriptionsForUser(userId, session);

  const payload = {
    userId,
    planId: plan._id,
    pendingPlanId: null,
    startDate,
    endDate,
    currentPeriodStart: startDate,
    currentPeriodEnd: endDate,
    paymentProvider: STRIPE_PROVIDER,
    paymentId: stripeSub.latest_invoice || null,
    stripeCustomerId:
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer?.id,
    stripeSubscriptionId: stripeSub.id,
    stripeSubscriptionItemId: stripeItem?.id || null,
    stripePriceId: stripeItem?.price?.id || plan.stripePriceId || null,
    amountPaid:
      (stripeItem?.price?.unit_amount || 0) / 100 || Number(plan.price) || 0,
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
    status: stripeSub.status === "active" ? "ACTIVE" : "PAST_DUE",
    updatedAt: now,
  };

  const createOptions = session ? { session } : {};
  const created = await Subscription.create([payload], createOptions);
  const subscription = created[0];

  const userUpdate = {
    subscriptionId: subscription._id,
    stripeCustomerId: payload.stripeCustomerId,
    updatedAt: now,
  };

  if (session) {
    await User.findByIdAndUpdate(userId, { $set: userUpdate }, { session });
    await clearReceiptRetention(userId, session);
    await recalculateUserReceiptStorage(userId, session);
  } else {
    await User.findByIdAndUpdate(userId, { $set: userUpdate });
    await clearReceiptRetention(userId);
    await recalculateUserReceiptStorage(userId);
  }

  return subscription;
};

const syncSubscriptionFromStripe = async (stripeSubscriptionId) => {
  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });

  const stripeItem = stripeSub.items?.data?.[0];
  const plan = await findPlanByStripePriceId(stripeItem?.price?.id);

  if (!plan) {
    throw new Error("No matching plan found for Stripe subscription price");
  }

  const user = await User.findOne({ stripeCustomerId: stripeSub.customer });
  if (!user) {
    throw new Error("User not found for Stripe customer");
  }

  const existing = await Subscription.findOne({
    stripeSubscriptionId: stripeSub.id,
    status: { $in: ["ACTIVE", "PAST_DUE"] },
  });

  const startDate = getStripePeriodStart(stripeSub);
  const endDate = getStripePeriodEnd(stripeSub);
  const now = new Date();

  if (existing) {
    const previousPeriodEnd = existing.currentPeriodEnd;
    const periodRolledOver =
      previousPeriodEnd &&
      startDate &&
      startDate.getTime() >= previousPeriodEnd.getTime();
    let planChanged = false;

    if (existing.pendingPlanId && !periodRolledOver) {
      // Keep the current plan until the billing period ends.
    } else if (existing.pendingPlanId && periodRolledOver) {
      const pendingPlan = await Plan.findById(existing.pendingPlanId).lean();
      existing.planId = pendingPlan?._id || plan._id;
      existing.pendingPlanId = null;
      planChanged = true;
      if (pendingPlan?.name === BASIC_PLAN_NAME) {
        await markUserLandedOnBasicPlan(user._id);
      }
    } else {
      if (String(existing.planId) !== String(plan._id)) {
        planChanged = true;
      }
      existing.planId = plan._id;
      existing.pendingPlanId = null;
    }

    existing.startDate = startDate || existing.startDate;
    existing.endDate = endDate || existing.endDate;
    existing.currentPeriodStart = startDate || existing.currentPeriodStart;
    existing.currentPeriodEnd = endDate || existing.currentPeriodEnd;
    existing.stripeSubscriptionItemId = stripeItem?.id || null;
    existing.stripePriceId = stripeItem?.price?.id || null;
    existing.amountPaid =
      (stripeItem?.price?.unit_amount || 0) / 100 || Number(plan.price) || 0;
    existing.cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);
    existing.status = stripeSub.status === "active" ? "ACTIVE" : "PAST_DUE";
    existing.updatedAt = now;
    await existing.save();

    await User.findByIdAndUpdate(user._id, {
      $set: { subscriptionId: existing._id, updatedAt: now },
    });

    const activePlan = await Plan.findById(existing.planId).lean();
    if (activePlan && activePlan.name !== BASIC_PLAN_NAME) {
      await clearReceiptRetention(user._id);
    }

    if (planChanged) {
      await recalculateUserReceiptStorage(user._id);
    }

    return existing;
  }

  return upsertSubscriptionRecord({
    userId: user._id,
    plan,
    stripeSubscription: stripeSub,
  });
};

const handleStripeSubscriptionDeleted = async (stripeSubscription) => {
  const user = await User.findOne({
    stripeCustomerId: stripeSubscription.customer,
  });

  if (!user) {
    return null;
  }

  await Subscription.updateMany(
    { stripeSubscriptionId: stripeSubscription.id },
    { $set: { status: "CANCELLED", updatedAt: new Date() } },
  );

  await assignBasicPlanToUser(user._id);
  await markUserLandedOnBasicPlan(user._id);
  await recalculateUserReceiptStorage(user._id);
  return null;
};

const fulfillCheckoutFromSession = async (session) => {
  const userId = session.metadata?.userId || session.client_reference_id;
  const planId = session.metadata?.planId;

  if (!userId || !planId) {
    const err = new Error("Checkout session is missing user or plan metadata");
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error("User not found for checkout session");
    err.statusCode = 404;
    throw err;
  }

  const plan = await getPlanById(planId);
  if (!plan) {
    const err = new Error("Plan not found for checkout session");
    err.statusCode = 404;
    throw err;
  }

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!stripeSubscriptionId) {
    const err = new Error("Checkout session did not include a subscription id");
    err.statusCode = 400;
    throw err;
  }

  const existing = await Subscription.findOne({
    stripeSubscriptionId,
    status: { $in: ["ACTIVE", "PAST_DUE"] },
  });

  if (existing) {
    return existing;
  }

  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });

  if (session.customer) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        stripeCustomerId: session.customer,
        updatedAt: new Date(),
      },
    });
  }

  return upsertSubscriptionRecord({
    userId,
    plan,
    stripeSubscription: stripeSub,
  });
};

const fulfillCheckoutSession = async (sessionId) => {
  if (!sessionId || typeof sessionId !== "string") {
    const err = new Error("Valid session_id is required");
    err.statusCode = 400;
    throw err;
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.status !== "complete") {
    const err = new Error("Checkout session is not completed yet");
    err.statusCode = 400;
    throw err;
  }

  if (!["paid", "no_payment_required"].includes(session.payment_status)) {
    const err = new Error("Checkout payment was not successful");
    err.statusCode = 400;
    throw err;
  }

  const subscription = await fulfillCheckoutFromSession(session);
  const populated = await Subscription.findById(subscription._id).populate(
    "planId",
  );

  return {
    sessionId: session.id,
    subscription: populated,
    plan: populated?.planId || null,
  };
};

const createCheckoutSession = async ({ userId, planId }) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const plan = await getPlanById(planId);
  if (!plan || !plan.isActive) {
    const err = new Error("Plan not found");
    err.statusCode = 404;
    throw err;
  }

  if (isFreePlan(plan)) {
    const err = new Error("Checkout is only available for paid plans");
    err.statusCode = 400;
    throw err;
  }

  assertPlanHasStripePrice(plan);

  const activeSubscription = user.subscriptionId
    ? await Subscription.findById(user.subscriptionId).lean()
    : null;

  if (
    activeSubscription?.status === "ACTIVE" &&
    activeSubscription.stripeSubscriptionId &&
    !activeSubscription.cancelAtPeriodEnd
  ) {
    const err = new Error(
      "You already have an active paid subscription. Use change-plan to upgrade or downgrade.",
    );
    err.statusCode = 400;
    throw err;
  }

  const stripe = getStripeClient();
  const customerId = await getOrCreateStripeCustomer(user);
  const { successUrl, cancelUrl } = getCheckoutUrls();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId.toString(),
    metadata: {
      userId: userId.toString(),
      planId: plan._id.toString(),
    },
    subscription_data: {
      metadata: {
        userId: userId.toString(),
        planId: plan._id.toString(),
      },
    },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  };
};

const changeSubscriptionPlan = async ({ userId, planId }) => {
  const user = await User.findById(userId).lean();
  if (!user?.subscriptionId) {
    const err = new Error("No active subscription found");
    err.statusCode = 404;
    throw err;
  }

  const subscription = await Subscription.findById(user.subscriptionId);
  if (
    !subscription ||
    !subscription.stripeSubscriptionId ||
    subscription.status !== "ACTIVE"
  ) {
    const err = new Error("No active Stripe subscription found");
    err.statusCode = 404;
    throw err;
  }

  const currentPlan = await getPlanById(subscription.planId);
  const newPlan = await getPlanById(planId);

  if (!newPlan || !newPlan.isActive) {
    const err = new Error("Plan not found");
    err.statusCode = 404;
    throw err;
  }

  if (currentPlan?._id?.toString() === newPlan._id.toString()) {
    const err = new Error("You are already on this plan");
    err.statusCode = 400;
    throw err;
  }

  if (isFreePlan(newPlan)) {
    const err = new Error(
      "Use the cancel subscription endpoint to move back to the free plan",
    );
    err.statusCode = 400;
    throw err;
  }

  assertPlanHasStripePrice(newPlan);

  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );
  const subscriptionItemId =
    subscription.stripeSubscriptionItemId || stripeSub.items.data[0]?.id;

  if (!subscriptionItemId) {
    const err = new Error("Stripe subscription item not found");
    err.statusCode = 500;
    throw err;
  }

  const isUpgrade = isPlanUpgrade(currentPlan, newPlan);

  const updatedStripeSub = await stripe.subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: false,
      items: [
        {
          id: subscriptionItemId,
          price: newPlan.stripePriceId,
        },
      ],
      proration_behavior: isUpgrade ? "always_invoice" : "none",
      metadata: {
        userId: userId.toString(),
        planId: newPlan._id.toString(),
      },
    },
  );

  if (isUpgrade) {
    subscription.planId = newPlan._id;
    subscription.pendingPlanId = null;
    subscription.cancelAtPeriodEnd = false;
    subscription.stripePriceId = newPlan.stripePriceId;
    subscription.amountPaid = newPlan.price;
    const periodStart = getStripePeriodStart(updatedStripeSub);
    const periodEnd = getStripePeriodEnd(updatedStripeSub);

    if (periodStart) {
      subscription.currentPeriodStart = periodStart;
    }

    if (periodEnd) {
      subscription.currentPeriodEnd = periodEnd;
      subscription.endDate = periodEnd;
    }
    subscription.updatedAt = new Date();
    await subscription.save();
    await clearReceiptRetention(userId);
    await recalculateUserReceiptStorage(userId);
  } else {
    subscription.pendingPlanId = newPlan._id;
    subscription.cancelAtPeriodEnd = false;
    subscription.updatedAt = new Date();
    await subscription.save();
  }

  const populated = await Subscription.findById(subscription._id).populate(
    "planId",
  );

  return {
    subscription: populated,
    effectiveImmediately: isUpgrade,
    message: isUpgrade
      ? "Plan upgraded successfully. Prorated charges may apply immediately."
      : `Plan downgrade scheduled. You will move to ${newPlan.name} at the end of the current billing period.`,
  };
};

const cancelSubscription = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user?.subscriptionId) {
    const err = new Error("No active subscription found");
    err.statusCode = 404;
    throw err;
  }

  const subscription = await Subscription.findById(user.subscriptionId);
  if (
    !subscription ||
    !subscription.stripeSubscriptionId ||
    subscription.status !== "ACTIVE"
  ) {
    const err = new Error("No active Stripe subscription found");
    err.statusCode = 404;
    throw err;
  }

  const basicPlan = await getBasicPlan();

  const stripe = getStripeClient();

  const updatedStripeSub = await stripe.subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: true,
    },
  );

  let periodEnd = getStripePeriodEnd(updatedStripeSub);

  if (!periodEnd) {
    const refreshed = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
      { expand: ["items.data.price"] },
    );
    periodEnd = getStripePeriodEnd(refreshed);
  }

  periodEnd =
    periodEnd || subscription.currentPeriodEnd || subscription.endDate;

  subscription.cancelAtPeriodEnd = true;
  subscription.pendingPlanId = basicPlan._id;

  if (periodEnd) {
    subscription.currentPeriodEnd = periodEnd;
    subscription.endDate = periodEnd;
  }

  subscription.updatedAt = new Date();
  await subscription.save();
  await markReceiptRetentionOnBasic(userId, { basicEffectiveAt: periodEnd });

  const populated = await Subscription.findById(subscription._id).populate(
    "planId",
  );

  return {
    subscription: populated,
    message:
      "Subscription cancellation scheduled. You will keep your current plan until the end of the billing period and then move to the free plan.",
  };
};

const reactivateSubscription = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user?.subscriptionId) {
    const err = new Error("No subscription found");
    err.statusCode = 404;
    throw err;
  }

  const subscription = await Subscription.findById(user.subscriptionId);
  if (!subscription?.stripeSubscriptionId) {
    const err = new Error("No Stripe subscription found");
    err.statusCode = 404;
    throw err;
  }

  if (!subscription.cancelAtPeriodEnd) {
    const err = new Error("Subscription is not scheduled for cancellation");
    err.statusCode = 400;
    throw err;
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  subscription.cancelAtPeriodEnd = false;
  subscription.pendingPlanId = null;
  subscription.updatedAt = new Date();
  await subscription.save();
  await clearReceiptRetention(userId);
  await recalculateUserReceiptStorage(userId);

  const populated = await Subscription.findById(subscription._id).populate(
    "planId",
  );

  return {
    subscription: populated,
    message: "Subscription reactivated. Billing will continue as normal.",
  };
};

module.exports = {
  STRIPE_PROVIDER,
  isFreePlan,
  findPlanByStripePriceId,
  getOrCreateStripeCustomer,
  upsertSubscriptionRecord,
  fulfillCheckoutFromSession,
  fulfillCheckoutSession,
  syncSubscriptionFromStripe,
  handleStripeSubscriptionDeleted,
  createCheckoutSession,
  changeSubscriptionPlan,
  cancelSubscription,
  reactivateSubscription,
};
