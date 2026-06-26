const mongoose = require("mongoose");

const User = require("../models/User");
const Session = require("../models/Session");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const USER_STATUSES = new Set(["ACTIVE", "DEACTIVATED", "DELETED"]);
const SORTABLE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "fullName",
  "email",
  "lastLoginAt",
  "status",
]);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildUserFilters = (query) => {
  const filters = {};

  if (query.status) {
    const statuses = String(query.status)
      .split(",")
      .map((value) => {
        const normalized = value.trim().toUpperCase();
        return normalized === "BLOCKED" ? "DEACTIVATED" : normalized;
      })
      .filter((value) => USER_STATUSES.has(value));

    if (statuses.length === 1) {
      filters.status = statuses[0];
    } else if (statuses.length > 1) {
      filters.status = { $in: statuses };
    }
  } else {
    filters.status = { $ne: "DELETED" };
  }

  if (query.onboardingCompleted === "true") {
    filters.onboardingCompleted = true;
  } else if (query.onboardingCompleted === "false") {
    filters.onboardingCompleted = false;
  }

  if (query.currency) {
    filters.currency = String(query.currency).trim().toUpperCase();
  }

  if (query.authProvider) {
    const provider = String(query.authProvider).trim().toUpperCase();
    if (["PASSWORD", "GOOGLE", "APPLE"].includes(provider)) {
      filters["authProviders.provider"] = provider;
    }
  }

  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filters.$or = [
        { fullName: regex },
        { email: regex },
        { mobileNumber: regex },
      ];
    }
  }

  if (query.createdFrom || query.createdTo) {
    filters.createdAt = {};
    if (query.createdFrom) {
      const from = new Date(query.createdFrom);
      if (!Number.isNaN(from.getTime())) {
        filters.createdAt.$gte = from;
      }
    }
    if (query.createdTo) {
      const to = new Date(query.createdTo);
      if (!Number.isNaN(to.getTime())) {
        filters.createdAt.$lte = to;
      }
    }
    if (Object.keys(filters.createdAt).length === 0) {
      delete filters.createdAt;
    }
  }

  if (query.lastLoginFrom || query.lastLoginTo) {
    filters.lastLoginAt = {};
    if (query.lastLoginFrom) {
      const from = new Date(query.lastLoginFrom);
      if (!Number.isNaN(from.getTime())) {
        filters.lastLoginAt.$gte = from;
      }
    }
    if (query.lastLoginTo) {
      const to = new Date(query.lastLoginTo);
      if (!Number.isNaN(to.getTime())) {
        filters.lastLoginAt.$lte = to;
      }
    }
    if (Object.keys(filters.lastLoginAt).length === 0) {
      delete filters.lastLoginAt;
    }
  }

  return filters;
};

const formatUserSummary = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  mobileNumber: user.mobileNumber ?? null,
  currency: user.currency,
  onboardingCompleted: user.onboardingCompleted,
  authProviders: (user.authProviders ?? []).map((provider) => provider.provider),
  status: user.status,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const formatUserDetail = (user, subscription, plan) => ({
  ...formatUserSummary(user),
  profileImage: user.profileImage ?? null,
  stripeCustomerId: user.stripeCustomerId ?? null,
  subscription: subscription
    ? {
        id: subscription._id,
        status: subscription.status,
        billingType: subscription.billingType,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        plan: plan
          ? {
              id: plan._id,
              name: plan.name,
            }
          : null,
      }
    : null,
});

const listUsers = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const sortField = SORTABLE_FIELDS.has(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const filters = buildUserFilters(req.query);

    const [users, total] = await Promise.all([
      User.find(filters)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(
          "fullName email mobileNumber currency onboardingCompleted authProviders status lastLoginAt createdAt updatedAt",
        )
        .lean(),
      User.countDocuments(filters),
    ]);

    return successResponse(res, "Users fetched successfully", {
      users: users.map(formatUserSummary),
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

const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid user id", 400);
    }

    const user = await User.findById(id)
      .select(
        "fullName email mobileNumber currency onboardingCompleted authProviders status lastLoginAt profileImage stripeCustomerId createdAt updatedAt subscriptionId",
      )
      .lean();

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    let subscription = null;
    let plan = null;

    if (user.subscriptionId) {
      subscription = await Subscription.findById(user.subscriptionId).lean();
      if (subscription?.planId) {
        plan = await Plan.findById(subscription.planId)
          .select("name")
          .lean();
      }
    }

    return successResponse(
      res,
      "User fetched successfully",
      formatUserDetail(user, subscription, plan),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid user id", 400);
    }

    const normalizedStatus =
      status === "BLOCKED" ? "DEACTIVATED" : status;

    if (!["ACTIVE", "DEACTIVATED"].includes(normalizedStatus)) {
      return errorResponse(res, "status must be ACTIVE or DEACTIVATED", 400);
    }

    const user = await User.findById(id);

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    if (user.status === "DELETED") {
      return errorResponse(res, "Cannot update a deleted user", 400);
    }

    user.status = normalizedStatus;
    await user.save();

    if (normalizedStatus === "DEACTIVATED") {
      await Session.deleteMany({ userId: user._id });
    }

    return successResponse(res, "User status updated successfully", {
      id: user._id,
      status: user.status,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listUsers,
  getUser,
  updateUserStatus,
};
