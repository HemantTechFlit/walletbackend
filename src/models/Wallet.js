const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    walletName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    icon: {
      type: String,
      default: "",
      trim: true,
    },

    color: {
      type: String,
      default: "0xff000000",
      trim: true,
    },

    currency: {
      type: String,
      default: "USD",
      uppercase: true,
      trim: true,
    },

    incomeTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    expenseTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    balance: {
      type: Number,
      default: 0,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

walletSchema.index({ userId: 1, createdAt: -1 });
walletSchema.index({ isDefault: 1, slug: 1 });

module.exports = mongoose.model("Wallet", walletSchema);
