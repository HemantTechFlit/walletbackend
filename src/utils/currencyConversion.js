const Currency = require("../models/Currency");
const { getLatestExchangeRates } = require("../services/exchangeRateService");

const normalizeCurrencyCode = (code) =>
  String(code || "")
    .trim()
    .toUpperCase();

const getRate = (rates, currency, baseCurrency) => {
  const code = normalizeCurrencyCode(currency);

  if (code === baseCurrency) {
    return 1;
  }

  const rate = rates[code];
  if (typeof rate !== "number" || rate <= 0) {
    const err = new Error(`Exchange rate not available for ${code}`);
    err.statusCode = 503;
    throw err;
  }

  return rate;
};

const roundCurrencyAmount = (amount, decimalPlaces = 2) => {
  const factor = 10 ** decimalPlaces;
  return Math.round(amount * factor) / factor;
};

const roundExchangeRate = (rate) => {
  if (!Number.isFinite(rate) || rate <= 0) {
    return rate;
  }

  if (rate >= 1) {
    return roundCurrencyAmount(rate, 2);
  }

  for (const decimalPlaces of [2, 4, 6, 8]) {
    const rounded = roundCurrencyAmount(rate, decimalPlaces);
    if (rounded > 0) {
      return rounded;
    }
  }

  return rate;
};

const convertAmount = ({
  amount,
  fromCurrency,
  toCurrency,
  rates,
  baseCurrency,
  decimalPlaces,
}) => {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const parsedAmount = Number(amount);

  if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
    const err = new Error("amount must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  if (from === to) {
    return roundCurrencyAmount(parsedAmount, decimalPlaces ?? 2);
  }

  const amountInBase =
    from === baseCurrency
      ? parsedAmount
      : parsedAmount / getRate(rates, from, baseCurrency);

  const converted =
    to === baseCurrency
      ? amountInBase
      : amountInBase * getRate(rates, to, baseCurrency);

  return roundCurrencyAmount(converted, decimalPlaces ?? 2);
};

const getUnitExchangeRate = ({ fromCurrency, toCurrency, rates, baseCurrency }) => {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (from === to) {
    return 1;
  }

  return convertAmount({
    amount: 1,
    fromCurrency: from,
    toCurrency: to,
    rates,
    baseCurrency,
    decimalPlaces: 8,
  });
};

const buildDefaultCurrencyConversions = ({
  defaultCurrency,
  currencyCodes,
  rates,
  baseCurrency,
}) => {
  const defaultCode = normalizeCurrencyCode(defaultCurrency);
  const conversions = [];

  for (const code of currencyCodes) {
    const targetCode = normalizeCurrencyCode(code);
    if (targetCode === defaultCode) {
      continue;
    }

    conversions.push(
      {
        from: defaultCode,
        to: targetCode,
        rate: roundExchangeRate(
          getUnitExchangeRate({
            fromCurrency: defaultCode,
            toCurrency: targetCode,
            rates,
            baseCurrency,
          }),
        ),
      },
      {
        from: targetCode,
        to: defaultCode,
        rate: roundExchangeRate(
          getUnitExchangeRate({
            fromCurrency: targetCode,
            toCurrency: defaultCode,
            rates,
            baseCurrency,
          }),
        ),
      },
    );
  }

  return conversions;
};

const resolveConversionAmounts = async ({
  amount,
  fromCurrency,
  toCurrency,
  amountIn = "from",
}) => {
  const normalizedAmountIn = String(amountIn || "from").trim().toLowerCase();
  if (!["from", "to"].includes(normalizedAmountIn)) {
    const err = new Error("amountIn must be from or to");
    err.statusCode = 400;
    throw err;
  }

  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error("amount must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const [fromCurrencyDoc, toCurrencyDoc, rateSnapshot] = await Promise.all([
    Currency.findOne({ code: from, isActive: true }).lean(),
    Currency.findOne({ code: to, isActive: true }).lean(),
    getLatestExchangeRates(),
  ]);

  if (!fromCurrencyDoc) {
    const err = new Error(`Unsupported currency: ${from}`);
    err.statusCode = 400;
    throw err;
  }

  if (!toCurrencyDoc) {
    const err = new Error(`Unsupported currency: ${to}`);
    err.statusCode = 400;
    throw err;
  }

  const { rates, baseCurrency, fetchedAt, rateDate } = rateSnapshot;
  let fromAmount;
  let toAmount;

  if (normalizedAmountIn === "from") {
    fromAmount = roundCurrencyAmount(parsedAmount, fromCurrencyDoc.decimalPlaces);
    toAmount = convertAmount({
      amount: fromAmount,
      fromCurrency: from,
      toCurrency: to,
      rates,
      baseCurrency,
      decimalPlaces: toCurrencyDoc.decimalPlaces,
    });
  } else {
    toAmount = roundCurrencyAmount(parsedAmount, toCurrencyDoc.decimalPlaces);
    fromAmount = convertAmount({
      amount: toAmount,
      fromCurrency: to,
      toCurrency: from,
      rates,
      baseCurrency,
      decimalPlaces: fromCurrencyDoc.decimalPlaces,
    });
  }

  const exchangeRate = getUnitExchangeRate({
    fromCurrency: from,
    toCurrency: to,
    rates,
    baseCurrency,
  });

  return {
    fromCurrency: from,
    toCurrency: to,
    fromAmount,
    toAmount,
    amountIn: normalizedAmountIn,
    exchangeRate,
    rateDescription: `1 ${from} = ${exchangeRate} ${to}`,
    baseCurrency,
    rateDate,
    rateUpdatedAt: fetchedAt,
  };
};

const resolveTransactionAmount = async ({
  amount,
  wallet,
  amountCurrency,
  amountIn = "from",
}) => {
  const walletCurrency = normalizeCurrencyCode(wallet.currency || "USD");
  const normalizedAmountIn = String(amountIn || "from").trim().toLowerCase();

  if (!["from", "to"].includes(normalizedAmountIn)) {
    const err = new Error("amountIn must be from or to");
    err.statusCode = 400;
    throw err;
  }

  const inputCurrency = amountCurrency
    ? normalizeCurrencyCode(amountCurrency)
    : walletCurrency;

  if (normalizedAmountIn === "to" && inputCurrency === walletCurrency) {
    const err = new Error(
      "amountCurrency must differ from wallet currency when amountIn is to",
    );
    err.statusCode = 400;
    throw err;
  }

  if (normalizedAmountIn === "to" && !amountCurrency) {
    const err = new Error("amountCurrency is required when amountIn is to");
    err.statusCode = 400;
    throw err;
  }

  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error("amount must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  if (normalizedAmountIn === "from" || inputCurrency === walletCurrency) {
    const walletCurrencyDoc = await Currency.findOne({
      code: walletCurrency,
      isActive: true,
    }).lean();

    if (!walletCurrencyDoc) {
      const err = new Error(`Unsupported currency: ${walletCurrency}`);
      err.statusCode = 400;
      throw err;
    }

    return {
      amount: roundCurrencyAmount(
        parsedAmount,
        walletCurrencyDoc.decimalPlaces,
      ),
      inputAmount: null,
      inputCurrency: null,
      walletCurrency,
      exchangeRate: null,
      rateUpdatedAt: null,
    };
  }

  const conversion = await resolveConversionAmounts({
    amount,
    fromCurrency: walletCurrency,
    toCurrency: inputCurrency,
    amountIn: "to",
  });

  return {
    amount: conversion.fromAmount,
    inputAmount: conversion.toAmount,
    inputCurrency: conversion.toCurrency,
    walletCurrency: conversion.fromCurrency,
    exchangeRate: conversion.exchangeRate,
    rateUpdatedAt: conversion.rateUpdatedAt,
  };
};

module.exports = {
  normalizeCurrencyCode,
  convertAmount,
  getUnitExchangeRate,
  buildDefaultCurrencyConversions,
  resolveConversionAmounts,
  resolveTransactionAmount,
  roundCurrencyAmount,
  roundExchangeRate,
};
