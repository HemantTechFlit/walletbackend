const User = require("../models/User");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");
const { formatWalletOrder } = require("./walletOrder");

const syncUserSelectionsFromDb = async (userId) => {
  const [wallets, categories] = await Promise.all([
    Wallet.find({ userId, isDeleted: false })
      .select(
        "walletName slug description icon color currency sortOrder createdAt",
      )
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean(),
    TransactionCategory.find({ userId, isDeleted: false })
      .select("name slug description icon color sortOrder createdAt")
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean(),
  ]);

  await User.findByIdAndUpdate(userId, {
    $set: {
      selectedWallets: wallets.map((w) => w._id),
      selectedCategories: categories.map((c) => c._id),
      updatedAt: new Date(),
    },
  });

  return { wallets, categories };
};

const buildUserProfilePayload = async (userId) => {
  const user = await User.findById(userId)
    .populate(
      "defaultWalletId",
      "walletName slug description icon color currency sortOrder",
    )
    .populate("subscriptionId");

  if (!user || user.isDeleted) {
    return null;
  }

  const { wallets, categories } = await syncUserSelectionsFromDb(userId);

  const userPayload = user.toObject();
  userPayload.selectedWallets = wallets;
  userPayload.selectedCategories = categories;
  userPayload.walletOrder = formatWalletOrder(user.walletOrder, wallets);
  delete userPayload.passwordHash;

  return userPayload;
};

module.exports = {
  syncUserSelectionsFromDb,
  buildUserProfilePayload,
};
