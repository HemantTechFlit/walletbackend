const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const occurrenceDecisionSchema = new mongoose.Schema(
  {
    occurrenceKey: {
      type: String,
      required: true,
    },

    occurrenceDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["ACCEPTED", "DECLINED"],
      required: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null,
    },

    decidedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const plannedPaymentSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["INCOME", "EXPENSE"],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    description: {
      type: String,
      default: null,
      maxlength: 500,
    },

    plannedType: {
      type: String,
      enum: ["ONE_TIME", "REPEATED"],
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      index: true,
    },

    repeatInterval: {
      type: Number,
      default: null,
      min: 1,
    },

    repeatUnit: {
      type: String,
      enum: ["DAYS", "WEEKS", "MONTHS", "YEARS", null],
      default: null,
    },

    repeatUntilTimes: {
      type: Number,
      default: null,
      min: 1,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },

    decisions: {
      type: [occurrenceDecisionSchema],
      default: [],
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

plannedPaymentSchema.index({ userId: 1, status: 1, startDate: 1 });
plannedPaymentSchema.index({ userId: 1, "decisions.occurrenceKey": 1 });

module.exports = mongoose.model("PlannedPayment", plannedPaymentSchema);
