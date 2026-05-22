const mongoose = require("mongoose");
const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },

    price: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "AUD",
    },

    billingType: {
      type: String,
      enum: ["MONTHLY", "YEARLY", "LIFETIME"],
      default: "MONTHLY",
    },

    maxWallets: {
      type: Number,
      default: 5,
    },

    adsEnabled: {
      type: Boolean,
      default: true,
    },

    monthlyReportLimit: {
      type: Number,
      default: 5,
    },

    cloudStorageLimitMB: {
      type: Number,
      default: 100,
    },

    features: [String],

    isActive: {
      type: Boolean,
      default: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);
module.exports = mongoose.model("Plan", planSchema);
