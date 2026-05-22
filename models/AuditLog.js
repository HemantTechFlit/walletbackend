const mongoose = require("mongoose");
const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      index: true,
    },

    module: {
      type: String,
      required: true,
      index: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    previousData: {
      type: Object,
      default: {},
    },

    newData: {
      type: Object,
      default: {},
    },

    ipAddress: {
      type: String,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
