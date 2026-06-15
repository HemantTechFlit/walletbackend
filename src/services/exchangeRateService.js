const Currency = require("../models/Currency");
const ExchangeRate = require("../models/ExchangeRate");
const { getSupportedCurrencyCodes } = require("../config/currencySeed");

const BASE_CURRENCY = (process.env.EXCHANGE_RATE_BASE_CURRENCY || "USD")
  .trim()
  .toUpperCase();

const EXCHANGE_RATE_API_URL =
  process.env.EXCHANGE_RATE_API_URL ||
  `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ratesMapToObject = (rates) => {
  if (!rates) {
    return {};
  }

  if (rates instanceof Map) {
    return Object.fromEntries(rates.entries());
  }

  return rates;
};

const fetchRatesFromProvider = async () => {
  const response = await fetch(EXCHANGE_RATE_API_URL);

  if (!response.ok) {
    throw new Error(`Exchange rate API failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (payload.result && payload.result !== "success") {
    throw new Error(payload["error-type"] || "Exchange rate API returned an error");
  }

  const rates = payload.rates || payload.conversion_rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Exchange rate API returned invalid rates payload");
  }

  return {
    baseCurrency: (payload.base_code || payload.base || BASE_CURRENCY).toUpperCase(),
    rates,
    rateDate: payload.time_last_update_utc || payload.date || null,
    source: EXCHANGE_RATE_API_URL,
  };
};

const filterRatesForSupportedCurrencies = (rates, supportedCodes) => {
  const filtered = new Map();
  const supportedSet = new Set(supportedCodes.map((code) => code.toUpperCase()));

  supportedSet.add(BASE_CURRENCY);

  supportedSet.forEach((code) => {
    if (code === BASE_CURRENCY) {
      filtered.set(code, 1);
      return;
    }

    const rate = rates[code];
    if (typeof rate === "number" && rate > 0) {
      filtered.set(code, rate);
    }
  });

  return filtered;
};

const refreshExchangeRates = async ({ force = false } = {}) => {
  const latest = await ExchangeRate.findOne().sort({ fetchedAt: -1 }).lean();

  if (
    !force &&
    latest?.fetchedAt &&
    Date.now() - new Date(latest.fetchedAt).getTime() < MS_PER_DAY
  ) {
    return latest;
  }

  const activeCurrencies = await Currency.find({ isActive: true })
    .select("code")
    .lean();
  const supportedCodes = activeCurrencies.map((currency) => currency.code);

  if (supportedCodes.length === 0) {
    throw new Error("No active currencies found to refresh exchange rates");
  }

  const providerData = await fetchRatesFromProvider();
  const filteredRates = filterRatesForSupportedCurrencies(
    providerData.rates,
    supportedCodes,
  );

  if (filteredRates.size < 2) {
    throw new Error("Not enough exchange rates were returned for supported currencies");
  }

  const snapshot = await ExchangeRate.findOneAndUpdate(
    { baseCurrency: providerData.baseCurrency },
    {
      $set: {
        baseCurrency: providerData.baseCurrency,
        rates: filteredRates,
        rateDate: providerData.rateDate,
        source: providerData.source,
        fetchedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(
    `✅ Exchange rates refreshed (${filteredRates.size} currencies, base ${providerData.baseCurrency})`,
  );

  return snapshot;
};

const getLatestExchangeRates = async () => {
  const snapshot = await ExchangeRate.findOne().sort({ fetchedAt: -1 }).lean();

  if (!snapshot) {
    const err = new Error("Exchange rates are not available yet");
    err.statusCode = 503;
    throw err;
  }

  return {
    baseCurrency: snapshot.baseCurrency,
    rates: ratesMapToObject(snapshot.rates),
    rateDate: snapshot.rateDate,
    fetchedAt: snapshot.fetchedAt,
    source: snapshot.source,
  };
};

const assertActiveCurrency = async (currencyCode) => {
  const code = String(currencyCode || "")
    .trim()
    .toUpperCase();

  if (code.length !== 3) {
    const err = new Error("currency must be a 3-letter code");
    err.statusCode = 400;
    throw err;
  }

  const currency = await Currency.findOne({ code, isActive: true }).lean();
  if (!currency) {
    const err = new Error(`Unsupported currency: ${code}`);
    err.statusCode = 400;
    throw err;
  }

  return currency;
};

module.exports = {
  BASE_CURRENCY,
  EXCHANGE_RATE_API_URL,
  refreshExchangeRates,
  getLatestExchangeRates,
  assertActiveCurrency,
  getSupportedCurrencyCodes,
};
