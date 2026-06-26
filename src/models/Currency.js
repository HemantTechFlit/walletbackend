const mongoose = require("mongoose");

const currencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    symbol: {
      type: String,
      default: "",
      trim: true,
    },

    decimalPlaces: {
      type: Number,
      default: 2,
      min: 0,
      max: 4,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

module.exports = mongoose.model("Currency", currencySchema);
