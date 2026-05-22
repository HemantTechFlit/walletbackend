const mongoose = require("mongoose");
const validator = require("validator");

const User = require("../models/User");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { getEffectivePlanForUser } = require("../utils/planLimits");
const { uploadProfileImageToDrive } = require("../utils/googleDrive");

const syncUserSelectionsFromDb = async (userId) => {
  const [wallets, categories] = await Promise.all([
    Wallet.find({ userId, isDeleted: false })
      .select("walletName createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    TransactionCategory.find({ userId, isDeleted: false })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  await User.findByIdAndUpdate(userId, {
    $set: {
      selectedWallets: wallets.map((w) => w._id),
      selectedCategories: categories.map((c) => c._id),
      updatedAt: new Date(),
    },
  });

  return { wallets, categories };
};

const getMe = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .populate("defaultWalletId", "walletName")
      .populate("subscriptionId");

    if (!user || user.isDeleted) {
      return errorResponse(res, "User not found", 404);
    }

    const { wallets, categories } = await syncUserSelectionsFromDb(userId);

    const userPayload = user.toObject();
    userPayload.selectedWallets = wallets;
    userPayload.selectedCategories = categories;

    const { plan } = await getEffectivePlanForUser(userId);

    return successResponse(res, "User fetched successfully", {
      user: userPayload,
      plan,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateMe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, mobileNumber, currency, profileImage, removeProfileImage } =
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

    if (currency !== undefined && currency !== "") {
      const c = String(currency).trim().toUpperCase();
      if (c.length !== 3) {
        return errorResponse(res, "currency must be a 3-letter code", 400);
      }
      updates.currency = c;
    }

    if (req.file) {
      const driveUrl = await uploadProfileImageToDrive({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        userId,
      });
      updates.profileImage = driveUrl;
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

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true },
    ).select("-passwordHash");

    if (!user || user.isDeleted) {
      return errorResponse(res, "User not found", 404);
    }

    return successResponse(res, "Profile updated successfully", user);
  } catch (error) {
    const code = error.message?.includes("Google Drive") ? 503 : 500;
    return errorResponse(res, error.message, code);
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

module.exports = {
  getMe,
  updateMe,
  setDefaultWallet,
};
