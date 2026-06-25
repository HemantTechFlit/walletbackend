const mongoose = require("mongoose");
const baseSchema = require("./BaseModel");

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    name: {
      type: String,
      trim: true,
      default: "Admin",
      maxlength: 100,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
      index: true,
    },

    ...baseSchema,
  },
  {
    versionKey: false,
  },
);

module.exports = mongoose.model("Admin", adminSchema);
