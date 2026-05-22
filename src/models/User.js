const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    mobileNumber: {
      type: String,
      sparse: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    profileImage: {
      type: String,
      default: null,
    },

    currency: {
      type: String,
      default: "AUD",
      uppercase: true,
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    selectedWallets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wallet",
      },
    ],

    selectedCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TransactionCategory",
      },
    ],
    defaultWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      default: null,
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "DELETED"],
      default: "ACTIVE",
      index: true,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

module.exports = mongoose.model("User", userSchema);
