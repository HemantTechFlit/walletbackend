const mongoose = require("mongoose");

const SupportSubmission = require("../models/SupportSubmission");
const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const SUBMISSION_TYPES = new Set([
  "HELP_CENTER",
  "BUG_REPORT",
  "FEATURE_REQUEST",
]);
const SUBMISSION_STATUSES = new Set(["OPEN", "CLOSED"]);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildSubmissionFilters = (query) => {
  const filters = { isDeleted: false };

  if (query.type) {
    const type = String(query.type).trim().toUpperCase();
    if (SUBMISSION_TYPES.has(type)) {
      filters.type = type;
    }
  }

  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (SUBMISSION_STATUSES.has(status)) {
      filters.status = status;
    }
  }

  if (query.userId && mongoose.isValidObjectId(query.userId)) {
    filters.userId = query.userId;
  }

  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filters.$or = [{ subject: regex }, { message: regex }];
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

  return filters;
};

const formatSubmissionSummary = (submission, user) => ({
  id: submission._id,
  type: submission.type,
  subject: submission.subject ?? null,
  messagePreview:
    submission.message.length > 120
      ? `${submission.message.slice(0, 120)}...`
      : submission.message,
  status: submission.status,
  hasAttachment: Boolean(submission.attachment),
  user: user
    ? {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      }
    : null,
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
});

const formatSubmissionDetail = (submission, user) => ({
  id: submission._id,
  type: submission.type,
  subject: submission.subject ?? null,
  message: submission.message,
  status: submission.status,
  attachment: submission.attachment ?? null,
  user: user
    ? {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber ?? null,
      }
    : null,
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
});

const listSupportSubmissions = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const filters = buildSubmissionFilters(req.query);

    const [submissions, total] = await Promise.all([
      SupportSubmission.find(filters)
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportSubmission.countDocuments(filters),
    ]);

    const userIds = [
      ...new Set(submissions.map((submission) => String(submission.userId))),
    ];
    const users = await User.find({ _id: { $in: userIds } })
      .select("fullName email")
      .lean();
    const userMap = new Map(users.map((user) => [String(user._id), user]));

    return successResponse(res, "Support submissions fetched successfully", {
      submissions: submissions.map((submission) =>
        formatSubmissionSummary(
          submission,
          userMap.get(String(submission.userId)),
        ),
      ),
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

const getSupportSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid submission id", 400);
    }

    const submission = await SupportSubmission.findOne({
      _id: id,
      isDeleted: false,
    }).lean();

    if (!submission) {
      return errorResponse(res, "Support submission not found", 404);
    }

    const user = await User.findById(submission.userId)
      .select("fullName email mobileNumber")
      .lean();

    return successResponse(
      res,
      "Support submission fetched successfully",
      formatSubmissionDetail(submission, user),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateSupportSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid submission id", 400);
    }

    if (status && !SUBMISSION_STATUSES.has(status)) {
      return errorResponse(res, "status must be OPEN or CLOSED", 400);
    }

    const submission = await SupportSubmission.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!submission) {
      return errorResponse(res, "Support submission not found", 404);
    }

    if (status) {
      submission.status = status;
    }

    await submission.save();

    const user = await User.findById(submission.userId)
      .select("fullName email mobileNumber")
      .lean();

    return successResponse(
      res,
      "Support submission updated successfully",
      formatSubmissionDetail(submission.toObject(), user),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listSupportSubmissions,
  getSupportSubmission,
  updateSupportSubmission,
};
