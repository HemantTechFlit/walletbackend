const getAppSettingsJson = () => ({
  appConfig: {
    version: "1.0.0",
  },
  adsConfig: {
    nativeAdsConfig: {
      adID: "ca-app-pub-3940256099942544/2247696110",
      dashboardScreen: true,
      walletScreen: false,
      accountScreen: false,
      settingsScreen: false,
    },
    interstitialAdConfig: {
      enabled: false,
      adID: "ca-app-pub-3940256099942544/1033173712",
      addTransactionScreen: true,
      addCategoryScreen: false,
      addPlannedPaymentScreen: false,
      timeBetweenNextAdInSeconds: 30,
    },
    rewardedInterstitialAdConfig: {
      enabled: false,
      adID: "ca-app-pub-3940256099942544/5354046379",
      reportGenerationScreen: true,
    },
    appOpenAdsConfig: {
      enabled: false,
      adID: "ca-app-pub-3940256099942544/3419835294",
    },
  },
  urlConfig: {
    rateUsURL:
      "https://play.google.com/store/apps/details?id=com.techflit.drive_ledger",
    shareURL:
      "Check out Ledger — a simple way to track your income and expenses. Download it here: https://play.google.com/store/apps/details?id=com.techflit.drive_ledger",
    privacyPolicyURL: "https://techflit.com/privacy-policy",
    supportEmail: "support@techflit.com",
  },
});

module.exports = {
  getAppSettingsJson,
};
