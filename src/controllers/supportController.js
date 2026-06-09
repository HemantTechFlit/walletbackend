const mongoose = require("mongoose");

const User = require("../models/User");
const SupportSubmission = require("../models/SupportSubmission");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { uploadSupportImage } = require("../utils/r2Storage");
const sendEmail = require("../utils/sendEmail");

const resolveMessage = (body) => {
  const value = body.message ?? body.msg;
  return typeof value === "string" ? value.trim() : "";
};

const assertAuthenticatedUserId = (req, res, requestedUserId) => {
  if (!requestedUserId || !mongoose.isValidObjectId(requestedUserId)) {
    errorResponse(res, "Valid userId is required", 400);
    return null;
  }

  if (requestedUserId !== req.user.userId) {
    errorResponse(res, "userId does not match the authenticated user", 403);
    return null;
  }

  return requestedUserId;
};

const uploadSubmissionAttachment = async (userId, file) => {
  if (!file) {
    return null;
  }

  const uploaded = await uploadSupportImage({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    userId,
  });

  return {
    fileUrl: uploaded.url,
    storageKey: uploaded.key,
    originalName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
  };
};

const notifySupportTeam = async ({ type, user, submission }) => {
  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!supportEmail) {
    return;
  }

  const typeLabel = type.replace(/_/g, " ");
  const attachmentLine = submission.attachment
    ? `<p><strong>Attachment:</strong> <a href="${submission.attachment.fileUrl}">${submission.attachment.originalName || "image"}</a></p>`
    : "";

  await sendEmail({
    to: supportEmail,
    subject: `[${typeLabel}] ${submission.subject || "New submission"}`,
    html: `
      <p><strong>Type:</strong> ${typeLabel}</p>
      <p><strong>User:</strong> ${user.fullName} (${user.email})</p>
      <p><strong>User ID:</strong> ${user._id}</p>
      ${submission.subject ? `<p><strong>Subject:</strong> ${submission.subject}</p>` : ""}
      <p><strong>Message:</strong></p>
      <p>${submission.message}</p>
      ${attachmentLine}
    `,
  });
};

const submitHelpCenter = async (req, res) => {
  try {
    const { subject, message, userId } = req.body;
    const resolvedUserId = assertAuthenticatedUserId(req, res, userId);
    if (!resolvedUserId) {
      return null;
    }

    const trimmedSubject =
      typeof subject === "string" ? subject.trim() : "";
    const trimmedMessage =
      typeof message === "string" ? message.trim() : "";

    if (!trimmedSubject) {
      return errorResponse(res, "subject is required", 400);
    }

    if (!trimmedMessage) {
      return errorResponse(res, "message is required", 400);
    }

    const user = await User.findOne({
      _id: resolvedUserId,
      isDeleted: false,
      status: "ACTIVE",
    }).select("fullName email");

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const submission = await SupportSubmission.create({
      userId: resolvedUserId,
      type: "HELP_CENTER",
      subject: trimmedSubject,
      message: trimmedMessage,
    });

    await notifySupportTeam({
      type: "HELP_CENTER",
      user,
      submission,
    });

    return successResponse(
      res,
      "Help center request submitted successfully",
      submission,
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const submitBugReport = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject } = req.body;
    const trimmedSubject =
      typeof subject === "string" ? subject.trim() : "";
    const trimmedMessage = resolveMessage(req.body);

    if (!trimmedSubject) {
      return errorResponse(res, "subject is required", 400);
    }

    if (!trimmedMessage) {
      return errorResponse(res, "msg is required", 400);
    }

    const user = await User.findOne({
      _id: userId,
      isDeleted: false,
      status: "ACTIVE",
    }).select("fullName email");

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const attachment = await uploadSubmissionAttachment(userId, req.file);

    const submission = await SupportSubmission.create({
      userId,
      type: "BUG_REPORT",
      subject: trimmedSubject,
      message: trimmedMessage,
      attachment,
    });

    await notifySupportTeam({
      type: "BUG_REPORT",
      user,
      submission,
    });

    return successResponse(
      res,
      "Bug report submitted successfully",
      submission,
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const submitFeatureRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const trimmedMessage = resolveMessage(req.body);

    if (!trimmedMessage) {
      return errorResponse(res, "msg is required", 400);
    }

    const user = await User.findOne({
      _id: userId,
      isDeleted: false,
      status: "ACTIVE",
    }).select("fullName email");

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const attachment = await uploadSubmissionAttachment(userId, req.file);

    const submission = await SupportSubmission.create({
      userId,
      type: "FEATURE_REQUEST",
      message: trimmedMessage,
      attachment,
    });

    await notifySupportTeam({
      type: "FEATURE_REQUEST",
      user,
      submission,
    });

    return successResponse(
      res,
      "Feature request submitted successfully",
      submission,
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  submitHelpCenter,
  submitBugReport,
  submitFeatureRequest,
};
