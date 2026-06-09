const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const attachmentSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, required: true },
    storageKey: { type: String, default: null },
    originalName: { type: String, default: null },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false },
);

const supportSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["HELP_CENTER", "BUG_REPORT", "FEATURE_REQUEST"],
      required: true,
      index: true,
    },

    subject: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    attachment: {
      type: attachmentSchema,
      default: null,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

supportSubmissionSchema.index({ userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("SupportSubmission", supportSubmissionSchema);
