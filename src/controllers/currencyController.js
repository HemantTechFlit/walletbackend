const Currency = require("../models/Currency");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const {
  BASE_CURRENCY,
  getLatestExchangeRates,
} = require("../services/exchangeRateService");
const {
  buildDefaultCurrencyConversions,
  resolveConversionAmounts,
} = require("../utils/currencyConversion");

const listCurrencies = async (req, res) => {
  try {
    const [currencies, rateSnapshot] = await Promise.all([
      Currency.find({ isActive: true }).sort({ sortOrder: 1, code: 1 }).lean(),
      getLatestExchangeRates().catch(() => null),
    ]);

    const defaultCurrency = rateSnapshot?.baseCurrency || BASE_CURRENCY;
    const conversions = rateSnapshot
      ? buildDefaultCurrencyConversions({
          defaultCurrency,
          currencyCodes: currencies.map((currency) => currency.code),
          rates: rateSnapshot.rates,
          baseCurrency: rateSnapshot.baseCurrency,
        })
      : [];

    return successResponse(res, "Currencies fetched successfully", {
      defaultCurrency,
      conversions,
    });
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

const convertCurrency = async (req, res) => {
  try {
    const { from, to, amount, amountIn } = req.query;

    if (!from || !to) {
      return errorResponse(res, "from and to currency codes are required", 400);
    }

    if (amount === undefined || amount === "") {
      return errorResponse(res, "amount is required", 400);
    }

    const conversion = await resolveConversionAmounts({
      amount,
      fromCurrency: from,
      toCurrency: to,
      amountIn,
    });

    return successResponse(res, "Currency conversion calculated successfully", conversion);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

module.exports = {
  listCurrencies,
  convertCurrency,
};
