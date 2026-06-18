const Currency = require("../models/Currency");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { getLatestExchangeRates } = require("../services/exchangeRateService");
const { buildWalletConversionMatrix } = require("../utils/currencyConversion");

const listCurrencies = async (req, res) => {
  try {
    const [currencies, rateSnapshot] = await Promise.all([
      Currency.find({ isActive: true }).sort({ sortOrder: 1, code: 1 }).lean(),
      getLatestExchangeRates().catch(() => null),
    ]);

    const rates = rateSnapshot?.rates || {};

    const data = currencies.map((currency) => ({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      decimalPlaces: currency.decimalPlaces,
      sortOrder: currency.sortOrder,
      rate:
        currency.code === (rateSnapshot?.baseCurrency || "USD")
          ? 1
          : rates[currency.code] ?? null,
    }));

    return successResponse(res, "Currencies fetched successfully", {
      baseCurrency: rateSnapshot?.baseCurrency || "USD",
      rateUpdatedAt: rateSnapshot?.fetchedAt || null,
      rateDate: rateSnapshot?.rateDate || null,
      currencies: data,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const convertCurrency = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [user, walletCurrencies] = await Promise.all([
      User.findById(userId).select("currency").lean(),
      Wallet.distinct("currency", { userId, isDeleted: false }),
    ]);

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    const data = await buildWalletConversionMatrix({
      defaultCurrency: user.currency,
      walletCurrencies,
    });

    return successResponse(
      res,
      "Currency conversions fetched successfully",
      data,
    );
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  listCurrencies,
  convertCurrency,
};
