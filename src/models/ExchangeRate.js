const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema(
  {
    baseCurrency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: "USD",
    },

    rates: {
      type: Map,
      of: Number,
      default: {},
    },

    rateDate: {
      type: String,
      default: null,
    },

    source: {
      type: String,
      default: "currency-conversion-and-exchange-rates.p.rapidapi.com",
    },

    fetchedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);
