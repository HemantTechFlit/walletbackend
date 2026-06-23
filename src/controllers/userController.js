const mongoose = require("mongoose");
const validator = require("validator");

const User = require("../models/User");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const WalletTransaction = require("../models/WalletTransaction");
const WalletTransfer = require("../models/WalletTransfer");
const PlannedPayment = require("../models/PlannedPayment");
const Subscription = require("../models/Subscription");
const Session = require("../models/Session");
const OTP = require("../models/OTP");
const Notification = require("../models/Notification");
const Attachment = require("../models/Attachment");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { getEffectivePlanForUser } = require("../utils/planLimits");
const { assertActiveCurrency } = require("../services/exchangeRateService");
const { buildReceiptRetentionInfo, buildReceiptRetentionWarnings, buildReceiptStorageInfo } = require("../utils/receiptUpload");
const { uploadProfileImage } = require("../utils/r2Storage");
const { buildUserProfilePayload } = require("../utils/userProfile");

const getMe = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userPayload = await buildUserProfilePayload(userId);

    if (!userPayload) {
      return errorResponse(res, "User not found", 404);
    }

    const { plan } = await getEffectivePlanForUser(userId);
    const { showWarning, deletingDate } = buildReceiptRetentionInfo(userPayload);
    const warnings = await buildReceiptRetentionWarnings(userPayload);
    const receiptStorage = await buildReceiptStorageInfo(userId, plan);

    return successResponse(res, "User fetched successfully", {
      user: userPayload,
      plan,
      showWarning,
      deletingDate,
      receiptStorage,
      warnings,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateMe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, mobileNumber, profileImage, removeProfileImage } =
      req.body;

    const updates = { updatedAt: new Date() };

    if (fullName !== undefined && fullName !== "") {
      if (typeof fullName !== "string" || !fullName.trim()) {
        return errorResponse(res, "fullName is invalid", 400);
      }
      updates.fullName = fullName.trim();
    }

    if (mobileNumber !== undefined) {
      if (mobileNumber && !validator.isMobilePhone(String(mobileNumber))) {
        return errorResponse(res, "Invalid mobile number", 400);
      }
      updates.mobileNumber = mobileNumber ? String(mobileNumber).trim() : null;
    }

    if (req.file) {
      const fileUrl = await uploadProfileImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        userId,
      });
      updates.profileImage = fileUrl;
    } else if (
      removeProfileImage === true ||
      removeProfileImage === "true"
    ) {
      updates.profileImage = null;
    } else if (
      profileImage !== undefined &&
      !(req.headers["content-type"] || "").includes("multipart/form-data")
    ) {
      updates.profileImage = profileImage || null;
    }

    await User.findByIdAndUpdate(userId, { $set: updates });

    const userPayload = await buildUserProfilePayload(userId);

    if (!userPayload) {
      return errorResponse(res, "User not found", 404);
    }

    return successResponse(res, "Profile updated successfully", {
      user: userPayload,
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return errorResponse(res, error.message, code);
  }
};

const setDefaultCurrency = async (req, res) => {
  try {
    const { defaultCurrency } = req.body;

    if (!defaultCurrency || !String(defaultCurrency).trim()) {
      return errorResponse(res, "defaultCurrency is required", 400);
    }

    let currencyCode;
    try {
      const activeCurrency = await assertActiveCurrency(defaultCurrency);
      currencyCode = activeCurrency.code;
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $set: { currency: currencyCode, updatedAt: new Date() },
    });

    const userPayload = await buildUserProfilePayload(req.user.userId);

    if (!userPayload) {
      return errorResponse(res, "User not found", 404);
    }

    return successResponse(res, "Default currency updated", {
      user: userPayload,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const setDefaultWallet = async (req, res) => {
  try {
    const { walletId } = req.body;

    if (!walletId || !mongoose.isValidObjectId(walletId)) {
      return errorResponse(res, "Valid walletId is required", 400);
    }

    const wallet = await Wallet.findOne({
      _id: walletId,
      userId: req.user.userId,
      isDeleted: false,
    });

    if (!wallet) {
      return errorResponse(res, "Wallet is not linked to your account", 400);
    }

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { defaultWalletId: walletId, updatedAt: new Date() } },
      { new: true },
    ).select("-passwordHash");

    return successResponse(res, "Default wallet updated", updated);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteMe = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.userId;
    const deletedAt = new Date();
    const anonymizedEmail = `deleted-${userId}-${deletedAt.getTime()}@deleted.local`;

    session.startTransaction();

    const user = await User.findOneAndUpdate(
      { _id: userId, isDeleted: false },
      {
        $set: {
          fullName: "Deleted User",
          email: anonymizedEmail,
          mobileNumber: null,
          profileImage: null,
          authProviders: [],
          selectedWallets: [],
          selectedCategories: [],
          defaultWalletId: null,
          subscriptionId: null,
          status: "DELETED",
          isDeleted: true,
          updatedAt: deletedAt,
        },
        $unset: {
          passwordHash: "",
          lastLoginAt: "",
        },
      },
      { new: true, session },
    );

    if (!user) {
      await session.abortTransaction();
      return errorResponse(res, "User not found", 404);
    }

    const softDeleteUpdate = {
      $set: {
        isDeleted: true,
        updatedAt: deletedAt,
      },
    };

    await Wallet.updateMany({ userId, isDeleted: false }, softDeleteUpdate, {
      session,
    });
    await TransactionCategory.updateMany(
      { userId, isDeleted: false },
      softDeleteUpdate,
      { session },
    );
    await WalletTransaction.updateMany(
      { userId, isDeleted: false },
      softDeleteUpdate,
      { session },
    );
    await PlannedPayment.updateMany(
      { userId, isDeleted: false },
      softDeleteUpdate,
      { session },
    );
    await Subscription.updateMany(
      { userId, status: "ACTIVE" },
      { $set: { status: "CANCELLED" } },
      { session },
    );
    await Session.deleteMany({ userId }, { session });
    await OTP.deleteMany({ userId }, { session });
    await WalletTransfer.deleteMany({ userId }, { session });
    await Notification.deleteMany({ userId }, { session });
    await Attachment.deleteMany({ userId }, { session });
    await Report.deleteMany({ userId }, { session });
    await AuditLog.deleteMany({ userId }, { session });

    await session.commitTransaction();

    return successResponse(res, "Account deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

module.exports = {
  getMe,
  updateMe,
  setDefaultCurrency,
  setDefaultWallet,
  deleteMe,
};
