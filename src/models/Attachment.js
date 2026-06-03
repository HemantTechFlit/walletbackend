const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fileUrl: {
      type: String,
      required: true,
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
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    purpose: {
      type: String,
      enum: ["RECEIPT", "PROFILE", "REPORT", "OTHER"],
      default: "OTHER",
      index: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null,
      index: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);
module.exports = mongoose.model("Attachment", attachmentSchema);
