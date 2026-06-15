const mongoose = require("mongoose");
const walletTransferSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fromWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    toWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    fromAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    toAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    fromCurrency: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },

    toCurrency: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },

    exchangeRate: {
      type: Number,
      default: null,
    },

    rateUpdatedAt: {
      type: Date,
      default: null,
    },

    title: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      default: null,
    },

    transferDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    debitTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },

    creditTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "SUCCESS",
      index: true,
    },

    receipt: {
      attachmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
        default: null,
      },
      fileUrl: {
        type: String,
        default: null,
      },
      storageKey: {
        type: String,
        default: null,
      },
      originalName: {
        type: String,
        default: null,
      },
      fileType: {
        type: String,
        default: null,
      },
      fileSize: {
        type: Number,
        default: null,
      },
      uploadedAt: {
        type: Date,
        default: null,
      },
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);
module.exports = mongoose.model("WalletTransfer", walletTransferSchema);
