const mongoose = require("mongoose");

const adminSessionSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },

    refreshToken: {
      type: String,
      required: true,
      index: true,
    },

    deviceInfo: {
      type: Object,
      default: {},
    },

    ipAddress: {
      type: String,
      default: null,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
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

module.exports = mongoose.model("AdminSession", adminSessionSchema);
