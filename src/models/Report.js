const mongoose = require("mongoose");
const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    walletIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Wallet",
      },
    ],

    reportType: {
      type: String,
      enum: ["PDF", "CSV", "RECEIPTS_CSV"],
      required: true,
    },

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    filters: {
      type: Object,
      default: {},
    },

    fileUrl: {
      type: String,
      default: null,
    },

    reportData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

reportSchema.index({ userId: 1, generatedAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
