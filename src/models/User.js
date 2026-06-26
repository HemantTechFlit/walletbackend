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
      select: false,
    },
    authProviders: [
      {
        provider: {
          type: String,
          enum: ["PASSWORD", "GOOGLE", "APPLE"],
          required: true,
        },
        providerUserId: {
          type: String,
          required: true,
        },
        email: {
          type: String,
          lowercase: true,
          trim: true,
        },
        linkedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
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
    walletOrder: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wallet",
      },
    ],

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
    },

    receiptRetentionStartedAt: {
      type: Date,
      default: null,
    },

    receiptDeletionScheduledAt: {
      type: Date,
      default: null,
    },

    receiptStorageUsedBytes: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "DEACTIVATED", "DELETED"],
      default: "ACTIVE",
      index: true,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

userSchema.index(
  { "authProviders.provider": 1, "authProviders.providerUserId": 1 },
  { sparse: true },
);

module.exports = mongoose.model("User", userSchema);
