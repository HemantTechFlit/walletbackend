const mongoose = require("mongoose");

const MONGODB_URI = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.9mzdwiq.mongodb.net/${process.env.DB_NAME}?appName=Cluster0`;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);

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
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = connectDB;
