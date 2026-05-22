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

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

walletSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Wallet", walletSchema);
