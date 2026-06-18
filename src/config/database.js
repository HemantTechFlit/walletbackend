const mongoose = require("mongoose");
const { ensureCurrenciesSeeded } = require("../config/currencySeed");
const { refreshExchangeRates } = require("../services/exchangeRateService");

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL is not set in environment variables");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUrl);

    // Ensure TTL index exists so expired OTPs are auto-removed by MongoDB.
    const otpCollection = mongoose.connection.db.collection("otps");
    const indexes = await otpCollection.indexes();
    const expiresAtIndex = indexes.find(
      (index) => index.key && index.key.expiresAt === 1,
    );

    if (expiresAtIndex && expiresAtIndex.expireAfterSeconds !== 0) {
      await otpCollection.dropIndex(expiresAtIndex.name);
    }

    if (!expiresAtIndex || expiresAtIndex.expireAfterSeconds !== 0) {
      await otpCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    console.log("✅ MongoDB Connected");

    await ensureCurrenciesSeeded();
    try {
      await refreshExchangeRates({ force: false });
    } catch (error) {
      console.error("Initial exchange rate refresh failed:", error.message);
    }
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = connectDB;
