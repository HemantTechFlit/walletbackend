const mongoose = require("mongoose");

const { successResponse, errorResponse } = require("../utils/responseHandler");
const { buildPlansCatalogForUser } = require("../utils/planLimits");
const { buildReceiptStorageInfo } = require("../utils/receiptUpload");
const {
  createCheckoutSession,
  fulfillCheckoutSession,
  changeSubscriptionPlan,
  cancelSubscription,
  reactivateSubscription,
} = require("../services/subscriptionService");
const { getEffectivePlanForUser } = require("../utils/planLimits");

const renderCheckoutSuccessPage = (planName) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription Activated</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; margin: 0; padding: 40px 16px; }
    .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 12px; font-size: 28px; color: #0f172a; }
    p { margin: 0 0 16px; color: #475569; line-height: 1.6; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 999px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Payment successful</div>
    <h1>Subscription activated</h1>
    <p>Your <strong>${planName}</strong> plan is now active. You can return to the app and start using your upgraded features.</p>
    <p>If your plan does not update immediately, refresh the subscription screen in the app.</p>
  </div>
</body>
</html>`;

const renderCheckoutCancelPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Checkout Cancelled</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; margin: 0; padding: 40px 16px; }
    .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 12px; font-size: 28px; color: #0f172a; }
    p { margin: 0; color: #475569; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Checkout cancelled</h1>
    <p>No payment was made. You can return to the app and try upgrading again whenever you are ready.</p>
  </div>
</body>
</html>`;

const getMySubscription = async (req, res) => {
  try {
    const catalog = await buildPlansCatalogForUser(req.user.userId);
    const receiptStorage = await buildReceiptStorageInfo(
      req.user.userId,
      catalog.plan,
    );

    return successResponse(res, "Subscription fetched successfully", {
      plans: catalog.plans,
      plan: catalog.plan,
      subscription: catalog.subscription,
      pendingPlan: catalog.pendingPlan,
      walletCount: catalog.walletCount,
      walletLimit: catalog.plan?.maxWallets ?? null,
      billingProvider: catalog.subscription?.paymentProvider || null,
      receiptStorage,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const createStripeCheckout = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId || !mongoose.isValidObjectId(planId)) {
      return errorResponse(res, "Valid planId is required", 400);
    }

    const checkout = await createCheckoutSession({
      userId: req.user.userId,
      planId,
    });

    return successResponse(res, "Stripe checkout session created successfully", checkout);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const changePlan = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId || !mongoose.isValidObjectId(planId)) {
      return errorResponse(res, "Valid planId is required", 400);
    }

    const result = await changeSubscriptionPlan({
      userId: req.user.userId,
      planId,
    });
    const { plan } = await getEffectivePlanForUser(req.user.userId);
    const receiptStorage = await buildReceiptStorageInfo(req.user.userId, plan);

    return successResponse(res, result.message, {
      subscription: result.subscription,
      effectiveImmediately: result.effectiveImmediately,
      receiptStorage,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const cancelMySubscription = async (req, res) => {
  try {
    const result = await cancelSubscription(req.user.userId);
    const { plan } = await getEffectivePlanForUser(req.user.userId);
    const receiptStorage = await buildReceiptStorageInfo(req.user.userId, plan);

    return successResponse(res, result.message, {
      subscription: result.subscription,
      receiptStorage,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const reactivateMySubscription = async (req, res) => {
  try {
    const result = await reactivateSubscription(req.user.userId);
    const { plan } = await getEffectivePlanForUser(req.user.userId);
    const receiptStorage = await buildReceiptStorageInfo(req.user.userId, plan);

    return successResponse(res, result.message, {
      subscription: result.subscription,
      receiptStorage,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const handleCheckoutSuccess = async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      if (req.query.format === "json") {
        return errorResponse(res, "session_id query parameter is required", 400);
      }
      return res.status(400).send(
        "<h1>Missing session</h1><p>The checkout session id was not provided.</p>",
      );
    }

    const result = await fulfillCheckoutSession(sessionId);
    const planName = result.plan?.name || "paid";

    if (req.query.format === "json") {
      return successResponse(res, "Subscription activated successfully", result);
    }

    return res.status(200).send(renderCheckoutSuccessPage(planName));
  } catch (error) {
    if (req.query.format === "json") {
      return errorResponse(res, error.message, error.statusCode || 500);
    }

    return res
      .status(error.statusCode || 500)
      .send(
        `<h1>Subscription activation failed</h1><p>${error.message}</p>`,
      );
  }
};

const handleCheckoutCancel = async (req, res) => {
  if (req.query.format === "json") {
    return successResponse(res, "Checkout cancelled", {
      cancelled: true,
    });
  }

  return res.status(200).send(renderCheckoutCancelPage());
};

const confirmCheckoutSession = async (req, res) => {
  try {
    const sessionId = req.query.session_id || req.body?.sessionId;

    if (!sessionId) {
      return errorResponse(res, "session_id is required", 400);
    }

    const result = await fulfillCheckoutSession(sessionId);

    if (
      result.subscription?.userId?.toString() &&
      result.subscription.userId.toString() !== req.user.userId
    ) {
      return errorResponse(res, "Checkout session does not belong to this user", 403);
    }

    return successResponse(res, "Subscription activated successfully", result);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  getMySubscription,
  createStripeCheckout,
  handleCheckoutSuccess,
  handleCheckoutCancel,
  confirmCheckoutSession,
  changePlan,
  cancelMySubscription,
  reactivateMySubscription,
};
