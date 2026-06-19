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

module.exports = {
  sortWalletsByEffectiveOrder,
};
