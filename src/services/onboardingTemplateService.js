const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");

const DEFAULT_TEMPLATE_FILTER = {
  isDefault: true,
  userId: null,
  isDeleted: false,
};

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const generateUniqueSlug = async (Model, baseValue, excludeId = null) => {
  const baseSlug = slugify(baseValue) || "item";
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const filter = {
      ...DEFAULT_TEMPLATE_FILTER,
      slug: candidate,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const existing = await Model.findOne(filter).select("_id").lean();

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
};

const getNextSortOrder = async (Model) => {
  const latest = await Model.findOne(DEFAULT_TEMPLATE_FILTER)
    .sort({ sortOrder: -1, createdAt: -1 })
    .select("sortOrder")
    .lean();

  return (latest?.sortOrder ?? 0) + 1;
};

const formatWalletOption = (wallet) => ({
  _id: wallet._id,
  id: wallet.slug,
  name: wallet.walletName,
  description: wallet.description || "",
  icon: wallet.icon || wallet.slug,
  color: wallet.color,
  currency: wallet.currency || "USD",
});

const formatCategoryOption = (category) => ({
  _id: category._id,
  id: category.slug,
  name: category.name,
  description: category.description || "",
  icon: category.icon || category.slug,
  color: category.color,
  type: category.type || "EXPENSE",
});

const formatAdminWallet = (wallet) => ({
  _id: wallet._id,
  name: wallet.walletName,
  icon: wallet.icon || "",
  color: wallet.color,
  currency: wallet.currency || "USD",
});

const formatAdminCategory = (category) => ({
  _id: category._id,
  name: category.name,
  icon: category.icon || "",
  color: category.color,
  type: category.type || "EXPENSE",
});

const groupCategoriesByType = (categories) => {
  const formatted = categories.map(formatCategoryOption);

  return {
    income: formatted.filter((category) => category.type === "INCOME"),
    expense: formatted.filter((category) => category.type === "EXPENSE"),
  };
};

const findDefaultWalletTemplate = async (id) =>
  Wallet.findOne({
    _id: id,
    ...DEFAULT_TEMPLATE_FILTER,
  });

const findDefaultCategoryTemplate = async (id) =>
  TransactionCategory.findOne({
    _id: id,
    ...DEFAULT_TEMPLATE_FILTER,
  });

module.exports = {
  DEFAULT_TEMPLATE_FILTER,
  Wallet,
  TransactionCategory,
  slugify,
  generateUniqueSlug,
  getNextSortOrder,
  formatWalletOption,
  formatCategoryOption,
  formatAdminWallet,
  formatAdminCategory,
  groupCategoriesByType,
  findDefaultWalletTemplate,
  findDefaultCategoryTemplate,
};
