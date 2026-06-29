const AD_TYPE_KEYS = [
  "InterstitialAd",
  "NativeAd",
  "RewardedAd",
  "AppOpenAd",
];

const DEFAULT_AD_UNIT_IDS = {
  InterstitialAd: {
    android: "ca-app-pub-3940256099942544/1033173712",
    ios: "ca-app-pub-3940256099942544/4411468910",
  },
  NativeAd: {
    android: "ca-app-pub-3940256099942544/2247696110",
    ios: "ca-app-pub-3940256099942544/3986624511",
  },
  RewardedAd: {
    android: "ca-app-pub-3940256099942544/5354046379",
    ios: "ca-app-pub-3940256099942544/6978759866",
  },
  AppOpenAd: {
    android: "ca-app-pub-3940256099942544/3419835294",
    ios: "ca-app-pub-3940256099942544/5662855259",
  },
};

const createDefaultAdTypeConfig = (adType) => {
  const adUnitIds = DEFAULT_AD_UNIT_IDS[adType];

  return {
    enabled: false,
    androidAdUnitId: adUnitIds.android,
    iosAdUnitId: adUnitIds.ios,
    extra: {},
    placements: [],
  };
};

const createDefaultAdsConfig = () =>
  AD_TYPE_KEYS.reduce((config, adType) => {
    config[adType] = createDefaultAdTypeConfig(adType);
    return config;
  }, {});

const getDefaultAppSettingsJson = () => ({
  appConfig: {
    minSupportedVersion: "1.0.0",
    appStoreURL: "",
    playStoreURL:
      "https://play.google.com/store/apps/details?id=com.techflit.drive_ledger",
    supportEmail: "support@techflit.com",
  },
  adsConfig: createDefaultAdsConfig(),
  urlConfig: {
    rateUsURL:
      "https://play.google.com/store/apps/details?id=com.techflit.drive_ledger",
    shareURL:
      "Check out Ledger — a simple way to track your income and expenses. Download it here: https://play.google.com/store/apps/details?id=com.techflit.drive_ledger",
    privacyPolicyURL: "https://techflit.com/privacy-policy",
  },
});

module.exports = {
  AD_TYPE_KEYS,
  createDefaultAdTypeConfig,
  createDefaultAdsConfig,
  getDefaultAppSettingsJson,
};
