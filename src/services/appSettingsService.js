const AppSettings = require("../models/AppSettings");
const {
  AD_TYPE_KEYS,
  getDefaultAppSettingsJson,
} = require("../config/appSettings");

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

const toAppSettingsJson = (doc) => {
  const defaults = getDefaultAppSettingsJson();

  return {
    appConfig: {
      ...defaults.appConfig,
      ...(doc.appConfig ?? {}),
    },
    adsConfig: AD_TYPE_KEYS.reduce((accumulator, adType) => {
      accumulator[adType] = {
        ...defaults.adsConfig[adType],
        ...(doc.adsConfig?.[adType] ?? {}),
        extra: {
          ...defaults.adsConfig[adType].extra,
          ...(doc.adsConfig?.[adType]?.extra ?? {}),
        },
        placements: Array.isArray(doc.adsConfig?.[adType]?.placements)
          ? doc.adsConfig[adType].placements
          : defaults.adsConfig[adType].placements,
      };
      return accumulator;
    }, {}),
    urlConfig: {
      ...defaults.urlConfig,
      ...(doc.urlConfig ?? {}),
    },
  };
};

const getAppSettingsJson = async () => {
  const doc = await AppSettings.findOne().sort({ updatedAt: -1 }).lean();

  if (!doc) {
    return getDefaultAppSettingsJson();
  }

  return toAppSettingsJson(doc);
};

const updateAppSettingsJson = async (partialSettings, options = {}) => {
  const { replaceSections = false } = options;
  const current = await getAppSettingsJson();

  const merged = replaceSections
    ? {
        appConfig: partialSettings.appConfig ?? current.appConfig,
        adsConfig: partialSettings.adsConfig ?? current.adsConfig,
        urlConfig: partialSettings.urlConfig ?? current.urlConfig,
      }
    : deepMerge(current, partialSettings);

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

const validateKeyValueObject = (value, fieldName) => {
  if (!isPlainObject(value)) {
    return `${fieldName} must be an object`;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof key !== "string" || !key.trim()) {
      return `${fieldName} keys must be non-empty strings`;
    }

    if (
      entryValue !== null &&
      typeof entryValue !== "string" &&
      typeof entryValue !== "number" &&
      typeof entryValue !== "boolean"
    ) {
      return `${fieldName}.${key} must be a string, number, or boolean`;
    }
  }

  return null;
};

const validatePlacement = (placement, context) => {
  if (!isPlainObject(placement)) {
    return `${context} must be an object`;
  }

  if (typeof placement.id !== "string" || !placement.id.trim()) {
    return `${context} must include a non-empty id`;
  }

  if (typeof placement.enabled !== "boolean") {
    return `${context}.enabled must be a boolean`;
  }

  if (
    typeof placement.androidAdUnitId !== "string" ||
    !placement.androidAdUnitId.trim()
  ) {
    return `${context}.androidAdUnitId must be a non-empty string`;
  }

  if (typeof placement.iosAdUnitId !== "string" || !placement.iosAdUnitId.trim()) {
    return `${context}.iosAdUnitId must be a non-empty string`;
  }

  const extraError = validateKeyValueObject(
    placement.extra ?? {},
    `${context}.extra`,
  );
  if (extraError) {
    return extraError;
  }

  return null;
};

const validateAdTypeConfig = (config, adType) => {
  if (!isPlainObject(config)) {
    return `${adType} must be an object`;
  }

  if (typeof config.enabled !== "boolean") {
    return `${adType}.enabled must be a boolean`;
  }

  if (
    typeof config.androidAdUnitId !== "string" ||
    !config.androidAdUnitId.trim()
  ) {
    return `${adType}.androidAdUnitId must be a non-empty string`;
  }

  if (typeof config.iosAdUnitId !== "string" || !config.iosAdUnitId.trim()) {
    return `${adType}.iosAdUnitId must be a non-empty string`;
  }

  const extraError = validateKeyValueObject(config.extra ?? {}, `${adType}.extra`);
  if (extraError) {
    return extraError;
  }

  if (!Array.isArray(config.placements)) {
    return `${adType}.placements must be an array`;
  }

  const seenIds = new Set();
  for (let index = 0; index < config.placements.length; index += 1) {
    const placementError = validatePlacement(
      config.placements[index],
      `${adType}.placements[${index}]`,
    );
    if (placementError) {
      return placementError;
    }

    const placementId = config.placements[index].id.trim();
    if (seenIds.has(placementId)) {
      return `${adType}.placements must have unique ids`;
    }
    seenIds.add(placementId);
  }

  return null;
};

const validateAdsConfig = (adsConfig) => {
  if (!isPlainObject(adsConfig)) {
    return "adsConfig must be an object";
  }

  const missingAdType = AD_TYPE_KEYS.find((adType) => !adsConfig[adType]);
  if (missingAdType) {
    return `adsConfig must include ${missingAdType}`;
  }

  for (const adType of AD_TYPE_KEYS) {
    const adTypeError = validateAdTypeConfig(adsConfig[adType], adType);
    if (adTypeError) {
      return adTypeError;
    }
  }

  return null;
};

const APP_CONFIG_KNOWN_KEYS = new Set([
  "minSupportedVersion",
  "appStoreURL",
  "playStoreURL",
  "supportEmail",
]);

const validateAppConfig = (appConfig) => {
  if (!isPlainObject(appConfig)) {
    return "appConfig must be an object";
  }

  const requiredStringFields = [
    "minSupportedVersion",
    "appStoreURL",
    "playStoreURL",
    "supportEmail",
  ];

  for (const field of requiredStringFields) {
    if (typeof appConfig[field] !== "string") {
      return `appConfig.${field} must be a string`;
    }
  }

  for (const [key, value] of Object.entries(appConfig)) {
    if (APP_CONFIG_KNOWN_KEYS.has(key)) {
      continue;
    }

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return `appConfig.${key} must be a string, number, or boolean`;
    }
  }

  return null;
};

const validateAppSettingsPayload = (appJson, options = {}) => {
  const { requireFullAdsConfig = false, requireFullAppConfig = false } = options;

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

  if (appJson.appConfig) {
    const appConfigError = validateAppConfig(appJson.appConfig);
    if (appConfigError) {
      return appConfigError;
    }
  } else if (requireFullAppConfig) {
    return "appJson must include appConfig";
  }

  if (appJson.adsConfig) {
    const adsConfigError = validateAdsConfig(appJson.adsConfig);
    if (adsConfigError) {
      return adsConfigError;
    }
  } else if (requireFullAdsConfig) {
    return "appJson must include adsConfig";
  }

  return null;
};

module.exports = {
  getAppSettingsJson,
  updateAppSettingsJson,
  validateAppSettingsPayload,
};
