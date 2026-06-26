const Currency = require("../models/Currency");
const ExchangeRate = require("../models/ExchangeRate");
const { getSupportedCurrencyCodes } = require("../config/currencySeed");

const BASE_CURRENCY = (process.env.EXCHANGE_RATE_BASE_CURRENCY || "USD")
  .trim()
  .toUpperCase();

const EXCHANGE_RATE_API_HOST =
  process.env.EXCHANGE_RATE_API_HOST ||
  "currency-conversion-and-exchange-rates.p.rapidapi.com";

const EXCHANGE_RATE_API_URL =
  process.env.EXCHANGE_RATE_API_URL ||
  `https://${EXCHANGE_RATE_API_HOST}/latest?base=${BASE_CURRENCY}`;

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
  const apiKey = process.env.RAPIDAPI_KEY?.trim();

  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is required to fetch exchange rates");
  }

  const response = await fetch(EXCHANGE_RATE_API_URL, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": EXCHANGE_RATE_API_HOST,
    },
  });

  console.log("fetchRatesFromProvider");

  if (!response.ok) {
    throw new Error(`Exchange rate API failed with status ${response.status}`);
  }

  const payload = await response.json();

  const hasError =
    payload.success === false ||
    (payload.result && payload.result !== "success");

  if (hasError) {
    throw new Error(
      payload.message ||
        payload["error-type"] ||
        "Exchange rate API returned an error",
    );
  }

  const rates = payload.rates || payload.conversion_rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Exchange rate API returned invalid rates payload");
  }

  return {
    baseCurrency: (
      payload.base ||
      payload.base_code ||
      BASE_CURRENCY
    ).toUpperCase(),
    rates,
    rateDate: payload.date || payload.time_last_update_utc || null,
    source: EXCHANGE_RATE_API_HOST,
  };
};

const filterRatesForSupportedCurrencies = (rates, supportedCodes) => {
  const filtered = new Map();
  const supportedSet = new Set(
    supportedCodes.map((code) => code.toUpperCase()),
  );

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

const getMissingActiveCurrencyCodes = async (snapshot) => {
  if (!snapshot) {
    return [];
  }

  const activeCurrencies = await Currency.find({ isActive: true })
    .select("code")
    .lean();
  const rates = ratesMapToObject(snapshot.rates);
  const base = (snapshot.baseCurrency || BASE_CURRENCY).toUpperCase();

  return activeCurrencies
    .map((currency) => currency.code.toUpperCase())
    .filter(
      (code) =>
        code !== base &&
        (typeof rates[code] !== "number" || rates[code] <= 0),
    );
};

const refreshExchangeRates = async ({ force = false } = {}) => {
  const latest = await ExchangeRate.findOne().sort({ fetchedAt: -1 }).lean();
  const missingCodes = await getMissingActiveCurrencyCodes(latest);
  const hasMissingCurrencies = missingCodes.length > 0;

  if (
    !force &&
    !hasMissingCurrencies &&
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
    throw new Error(
      "Not enough exchange rates were returned for supported currencies",
    );
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
  let snapshot = await ExchangeRate.findOne().sort({ fetchedAt: -1 }).lean();

  const missingCodes = await getMissingActiveCurrencyCodes(snapshot);
  if (missingCodes.length > 0) {
    snapshot = await refreshExchangeRates({ force: true });
  }

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
  EXCHANGE_RATE_API_HOST,
  EXCHANGE_RATE_API_URL,
  refreshExchangeRates,
  getLatestExchangeRates,
  assertActiveCurrency,
  getSupportedCurrencyCodes,
};
