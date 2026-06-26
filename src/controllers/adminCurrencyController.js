const mongoose = require("mongoose");

const Currency = require("../models/Currency");
const { refreshExchangeRates } = require("../services/exchangeRateService");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const refreshRatesForCurrency = async (code) => {
  try {
    const snapshot = await refreshExchangeRates({ force: true });
    const rates =
      snapshot.rates instanceof Map
        ? Object.fromEntries(snapshot.rates.entries())
        : snapshot.rates || {};

    if (
      code !== snapshot.baseCurrency &&
      (typeof rates[code] !== "number" || rates[code] <= 0)
    ) {
      console.warn(`Exchange rate not available from provider for ${code}`);
    }
  } catch (error) {
    console.error(
      `Exchange rate refresh failed after currency change (${code}):`,
      error.message,
    );
  }
};

const formatAdminCurrency = (currency) => ({
  id: currency._id,
  code: currency.code,
  name: currency.name,
  symbol: currency.symbol,
  decimalPlaces: currency.decimalPlaces,
  sortOrder: currency.sortOrder,
  isActive: currency.isActive,
});

const getNextSortOrder = async () => {
  const latest = await Currency.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
  return (latest?.sortOrder ?? 0) + 1;
};

const listCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ isActive: true })
      .sort({ sortOrder: 1, code: 1 })
      .lean();

    return successResponse(res, "Currencies fetched successfully", {
      currencies: currencies.map(formatAdminCurrency),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createCurrency = async (req, res) => {
  try {
    const code = String(req.body.code || "")
      .trim()
      .toUpperCase();
    const name = String(req.body.name || "").trim();
    const symbol = String(req.body.symbol || "").trim();

    if (code.length !== 3) {
      return errorResponse(res, "code must be a 3-letter currency code", 400);
    }

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    const existing = await Currency.findOne({ code });
    if (existing) {
      return errorResponse(res, "A currency with this code already exists", 409);
    }

    const decimalPlaces = Number(req.body.decimalPlaces ?? 2);
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 4) {
      return errorResponse(res, "decimalPlaces must be between 0 and 4", 400);
    }

    const sortOrder =
      req.body.sortOrder !== undefined
        ? Number(req.body.sortOrder)
        : await getNextSortOrder();

    const currency = await Currency.create({
      code,
      name,
      symbol,
      decimalPlaces,
      sortOrder,
      isActive: req.body.isActive !== false,
    });

    if (currency.isActive) {
      await refreshRatesForCurrency(code);
    }

    return successResponse(
      res,
      "Currency created successfully",
      formatAdminCurrency(currency.toObject()),
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateCurrency = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid currency id", 400);
    }

    const currency = await Currency.findById(id);

    if (!currency) {
      return errorResponse(res, "Currency not found", 404);
    }

    const code = String(req.body.code || currency.code || "")
      .trim()
      .toUpperCase();
    const name = String(req.body.name || "").trim();
    const symbol = String(req.body.symbol || "").trim();

    if (code.length !== 3) {
      return errorResponse(res, "code must be a 3-letter currency code", 400);
    }

    if (!name) {
      return errorResponse(res, "name is required", 400);
    }

    if (code !== currency.code) {
      const existing = await Currency.findOne({ code });
      if (existing) {
        return errorResponse(res, "A currency with this code already exists", 409);
      }
    }

    const decimalPlaces = Number(req.body.decimalPlaces ?? currency.decimalPlaces);
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 4) {
      return errorResponse(res, "decimalPlaces must be between 0 and 4", 400);
    }

    const wasInactive = !currency.isActive;
    const codeChanged = code !== currency.code;

    currency.code = code;
    currency.name = name;
    currency.symbol = symbol;
    currency.decimalPlaces = decimalPlaces;

    if (req.body.sortOrder !== undefined) {
      currency.sortOrder = Number(req.body.sortOrder);
    }

    if (typeof req.body.isActive === "boolean") {
      currency.isActive = req.body.isActive;
    }

    await currency.save();

    if (currency.isActive && (wasInactive || codeChanged)) {
      await refreshRatesForCurrency(currency.code);
    }

    return successResponse(
      res,
      "Currency updated successfully",
      formatAdminCurrency(currency.toObject()),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteCurrency = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid currency id", 400);
    }

    const currency = await Currency.findById(id);

    if (!currency) {
      return errorResponse(res, "Currency not found", 404);
    }

    currency.isActive = false;
    await currency.save();

    return successResponse(res, "Currency deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency,
};
