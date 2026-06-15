const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const transactionCategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
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
      default: "0xff8a8f98",
      trim: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    type: {
      type: String,
      enum: ["INCOME", "EXPENSE"],
      default: "EXPENSE",
      index: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

transactionCategorySchema.index({ isDefault: 1, slug: 1 });

module.exports = mongoose.model(
  "TransactionCategory",
  transactionCategorySchema,
);
