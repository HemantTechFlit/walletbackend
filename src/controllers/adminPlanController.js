const mongoose = require("mongoose");

const Plan = require("../models/Plan");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const {
  normalizePlanFeatures,
  parsePlanFeaturesInput,
} = require("../utils/planFeatures");

const formatAdminPlan = (plan) => ({
  id: plan._id,
  name: plan.name,
  price: plan.price,
  currency: plan.currency,
  billingType: plan.billingType,
  maxWallets: plan.maxWallets,
  adsEnabled: plan.adsEnabled,
  monthlyReportLimit: plan.monthlyReportLimit,
  cloudStorageLimitMB: plan.cloudStorageLimitMB,
  stripeProductId: plan.stripeProductId ?? null,
  stripePriceId: plan.stripePriceId ?? null,
  features: normalizePlanFeatures(plan.features),
  isActive: plan.isActive,
  createdAt: plan.createdAt,
});

const listPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ createdAt: 1 }).lean();

    return successResponse(res, "Plans fetched successfully", {
      plans: plans.map(formatAdminPlan),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid plan id", 400);
    }

    const plan = await Plan.findById(id);

    if (!plan) {
      return errorResponse(res, "Plan not found", 404);
    }

    if (req.body.features === undefined) {
      return errorResponse(res, "features is required", 400);
    }

    try {
      plan.features = parsePlanFeaturesInput(req.body.features);
      plan.markModified("features");
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    await plan.save();

    return successResponse(
      res,
      "Plan features updated successfully",
      formatAdminPlan(plan.toObject()),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listPlans,
  updatePlan,
};
