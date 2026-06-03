const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionCategory",
      default: null,
      index: true,
    },

    type: {
      type: String,
      enum: ["INCOME", "EXPENSE"],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      default: null,
      maxlength: 500,
    },

    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },

    transactionTimestamp: {
      type: Number,
      default: () => Date.now(),
    },

    categorySnapshot: {
      name: String,
      color: String,
      icon: String,
    },

    walletSnapshot: {
      walletName: String,
      walletColor: String,
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

walletTransactionSchema.index({
  userId: 1,
  walletId: 1,
  transactionDate: -1,
});

walletTransactionSchema.index({
  userId: 1,
  type: 1,
});

walletTransactionSchema.index({
  userId: 1,
  categoryId: 1,
});

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
