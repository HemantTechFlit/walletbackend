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

module.exports = mongoose.model(
  "TransactionCategory",
  transactionCategorySchema,
);
