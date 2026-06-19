const AppSettings = require("../models/AppSettings");
const { getDefaultAppSettingsJson } = require("../config/appSettings");

const APP_SETTINGS_KEYS = ["appConfig", "adsConfig", "urlConfig"];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const deepMerge = (target, source) => {
  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
};

const toAppSettingsJson = (doc) => ({
  appConfig: doc.appConfig,
  adsConfig: doc.adsConfig,
  urlConfig: doc.urlConfig,
});

const getAppSettingsJson = async () => {
  const doc = await AppSettings.findOne().sort({ updatedAt: -1 }).lean();

  if (!doc) {
    return getDefaultAppSettingsJson();
  }

  return toAppSettingsJson(doc);
};

const updateAppSettingsJson = async (partialSettings) => {
  const current = await getAppSettingsJson();
  const merged = deepMerge(current, partialSettings);

  const doc = await AppSettings.findOneAndUpdate(
    {},
    {
      $set: {
        appConfig: merged.appConfig,
        adsConfig: merged.adsConfig,
        urlConfig: merged.urlConfig,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return toAppSettingsJson(doc);
};

const validateAppSettingsPayload = (appJson) => {
  if (!isPlainObject(appJson)) {
    return "appJson must be an object";
  }

  const keys = Object.keys(appJson);
  if (keys.length === 0) {
    return "appJson must include at least one setting section";
  }

  const invalidKey = keys.find((key) => !APP_SETTINGS_KEYS.includes(key));
  if (invalidKey) {
    return `Invalid appJson key: ${invalidKey}`;
  }

  for (const key of keys) {
    if (!isPlainObject(appJson[key])) {
      return `${key} must be an object`;
    }
  }

  return null;
};

module.exports = {
  getAppSettingsJson,
  updateAppSettingsJson,
  validateAppSettingsPayload,
};
