const mongoose = require("mongoose");

const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertActiveCurrency } = require("../services/exchangeRateService");
const {
  DEFAULT_TEMPLATE_FILTER,
  Wallet,
  TransactionCategory,
  generateUniqueSlug,
  getNextSortOrder,
  formatAdminWallet,
  formatAdminCategory,
  findDefaultWalletTemplate,
  findDefaultCategoryTemplate,
} = require("../services/onboardingTemplateService");

const listOnboardingWallets = async (req, res) => {
  try {
    const wallets = await Wallet.find(DEFAULT_TEMPLATE_FILTER)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    return successResponse(res, "Onboarding wallets fetched successfully", {
      wallets: wallets.map(formatAdminWallet),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createOnboardingWallet = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const icon = String(req.body.icon || "").trim();
    const color = String(req.body.color || "").trim();
    const { currency } = req.body;

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    if (!icon) {
      return errorResponse(res, "icon is required", 400);
    }

    if (!color) {
      return errorResponse(res, "color is required", 400);
    }

    if (!currency || !String(currency).trim()) {
      return errorResponse(res, "currency is required", 400);
    }

    let currencyCode;

    try {
      const activeCurrency = await assertActiveCurrency(currency);
      currencyCode = activeCurrency.code;
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    const slug = await generateUniqueSlug(Wallet, name);
    const sortOrder = await getNextSortOrder(Wallet);

    const wallet = await Wallet.create({
      userId: null,
      isDefault: true,
      walletName: name,
      slug,
      icon,
      color,
      currency: currencyCode,
      sortOrder,
    });

    return successResponse(
      res,
      "Onboarding wallet created successfully",
      formatAdminWallet(wallet.toObject()),
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateOnboardingWallet = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const wallet = await findDefaultWalletTemplate(id);

    if (!wallet) {
      return errorResponse(res, "Onboarding wallet not found", 404);
    }

    const name = String(req.body.name || "").trim();
    const icon = String(req.body.icon || "").trim();
    const color = String(req.body.color || "").trim();
    const { currency } = req.body;

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    if (!icon) {
      return errorResponse(res, "icon is required", 400);
    }

    if (!color) {
      return errorResponse(res, "color is required", 400);
    }

    if (!currency || !String(currency).trim()) {
      return errorResponse(res, "currency is required", 400);
    }

    let currencyCode;

    try {
      const activeCurrency = await assertActiveCurrency(currency);
      currencyCode = activeCurrency.code;
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    if (name !== wallet.walletName) {
      wallet.slug = await generateUniqueSlug(Wallet, name, wallet._id);
    }

    wallet.walletName = name;
    wallet.icon = icon;
    wallet.color = color;
    wallet.currency = currencyCode;
    wallet.updatedAt = new Date();
    await wallet.save();

    return successResponse(
      res,
      "Onboarding wallet updated successfully",
      formatAdminWallet(wallet.toObject()),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteOnboardingWallet = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid wallet id", 400);
    }

    const wallet = await findDefaultWalletTemplate(id);

    if (!wallet) {
      return errorResponse(res, "Onboarding wallet not found", 404);
    }

    wallet.isDeleted = true;
    wallet.updatedAt = new Date();
    await wallet.save();

    return successResponse(res, "Onboarding wallet deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const listOnboardingCategories = async (req, res) => {
  try {
    const categories = await TransactionCategory.find(DEFAULT_TEMPLATE_FILTER)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    return successResponse(res, "Onboarding categories fetched successfully", {
      categories: categories.map(formatAdminCategory),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createOnboardingCategory = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const icon = String(req.body.icon || "").trim();
    const color = String(req.body.color || "").trim();
    const { type } = req.body;

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    if (!icon) {
      return errorResponse(res, "icon is required", 400);
    }

    if (!color) {
      return errorResponse(res, "color is required", 400);
    }

    if (!type || !["INCOME", "EXPENSE"].includes(type)) {
      return errorResponse(res, "type must be INCOME or EXPENSE", 400);
    }

    const slug = await generateUniqueSlug(TransactionCategory, name);
    const sortOrder = await getNextSortOrder(TransactionCategory);

    const category = await TransactionCategory.create({
      userId: null,
      isDefault: true,
      name,
      slug,
      icon,
      color,
      type,
      sortOrder,
    });

    return successResponse(
      res,
      "Onboarding category created successfully",
      formatAdminCategory(category.toObject()),
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateOnboardingCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid category id", 400);
    }

    const category = await findDefaultCategoryTemplate(id);

    if (!category) {
      return errorResponse(res, "Onboarding category not found", 404);
    }

    const name = String(req.body.name || "").trim();
    const icon = String(req.body.icon || "").trim();
    const color = String(req.body.color || "").trim();
    const { type } = req.body;

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    if (!icon) {
      return errorResponse(res, "icon is required", 400);
    }

    if (!color) {
      return errorResponse(res, "color is required", 400);
    }

    if (!type || !["INCOME", "EXPENSE"].includes(type)) {
      return errorResponse(res, "type must be INCOME or EXPENSE", 400);
    }

    if (name !== category.name) {
      category.slug = await generateUniqueSlug(
        TransactionCategory,
        name,
        category._id,
      );
    }

    category.name = name;
    category.icon = icon;
    category.color = color;
    category.type = type;
    category.updatedAt = new Date();
    await category.save();

    return successResponse(
      res,
      "Onboarding category updated successfully",
      formatAdminCategory(category.toObject()),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteOnboardingCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid category id", 400);
    }

    const category = await findDefaultCategoryTemplate(id);

    if (!category) {
      return errorResponse(res, "Onboarding category not found", 404);
    }

    category.isDeleted = true;
    category.updatedAt = new Date();
    await category.save();

    return successResponse(res, "Onboarding category deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listOnboardingWallets,
  createOnboardingWallet,
  updateOnboardingWallet,
  deleteOnboardingWallet,
  listOnboardingCategories,
  createOnboardingCategory,
  updateOnboardingCategory,
  deleteOnboardingCategory,
};
