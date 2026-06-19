const sortWalletsByEffectiveOrder = (wallets, walletOrder = []) => {
  const walletById = new Map(wallets.map((wallet) => [wallet._id.toString(), wallet]));
  const customOrdered = [];
  const seen = new Set();

  for (const walletId of walletOrder) {
    const key = walletId.toString();
    const wallet = walletById.get(key);
    if (!wallet || seen.has(key)) {
      continue;
    }
    customOrdered.push(wallet);
    seen.add(key);
  }

  const remaining = wallets
    .filter((wallet) => !seen.has(wallet._id.toString()))
    .sort((a, b) => a.walletName.localeCompare(b.walletName, undefined, { sensitivity: "base" }));

  return [...customOrdered, ...remaining];
};

const formatWalletOrder = (walletOrder = [], wallets = []) => {
  const walletById = new Map(
    wallets.map((wallet) => [wallet._id.toString(), wallet]),
  );

  return walletOrder
    .map((walletId) => {
      const wallet = walletById.get(walletId.toString());
      if (!wallet) {
        return null;
      }

      return {
        _id: wallet._id,
        walletName: wallet.walletName,
      };
    })
    .filter(Boolean);
};

module.exports = {
  sortWalletsByEffectiveOrder,
  formatWalletOrder,
};
