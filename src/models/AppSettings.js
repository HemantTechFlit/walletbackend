const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    appConfig: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    adsConfig: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    urlConfig: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);
