const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const legalDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"],
      required: true,
      unique: true,
      index: true,
    },

    contentHtml: {
      type: String,
      default: "",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

module.exports = mongoose.model("LegalDocument", legalDocumentSchema);
