const Currency = require("../models/Currency");

const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", sortOrder: 1 },
  { code: "EUR", name: "Euro", symbol: "€", sortOrder: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", sortOrder: 3 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", sortOrder: 4 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", sortOrder: 5 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", sortOrder: 6 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalPlaces: 0, sortOrder: 7 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", sortOrder: 8 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", sortOrder: 9 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", sortOrder: 10 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", sortOrder: 11 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", sortOrder: 12 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", sortOrder: 13 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", sortOrder: 14 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", sortOrder: 15 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimalPlaces: 0, sortOrder: 16 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", sortOrder: 17 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", sortOrder: 18 },
  { code: "ZAR", name: "South African Rand", symbol: "R", sortOrder: 19 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", sortOrder: 20 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", sortOrder: 21 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", sortOrder: 22 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", sortOrder: 23 },
  { code: "THB", name: "Thai Baht", symbol: "฿", sortOrder: 24 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", sortOrder: 25 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimalPlaces: 0, sortOrder: 26 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", sortOrder: 27 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", sortOrder: 28 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", sortOrder: 29 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimalPlaces: 0, sortOrder: 30 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", sortOrder: 31 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", sortOrder: 32 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", sortOrder: 33 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", sortOrder: 34 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimalPlaces: 0, sortOrder: 35 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", sortOrder: 36 },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", sortOrder: 37 },
  { code: "CLP", name: "Chilean Peso", symbol: "CLP$", decimalPlaces: 0, sortOrder: 38 },
  { code: "COP", name: "Colombian Peso", symbol: "COL$", decimalPlaces: 0, sortOrder: 39 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", sortOrder: 40 },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$", sortOrder: 41 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", sortOrder: 42 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", sortOrder: 43 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", sortOrder: 44 },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR", sortOrder: 45 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimalPlaces: 3, sortOrder: 46 },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", decimalPlaces: 3, sortOrder: 47 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD", decimalPlaces: 3, sortOrder: 48 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", decimalPlaces: 3, sortOrder: 49 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", sortOrder: 50 },
];

const ensureCurrenciesSeeded = async () => {
  const existingCount = await Currency.countDocuments();

  if (existingCount >= SUPPORTED_CURRENCIES.length) {
    return;
  }

  await Promise.all(
    SUPPORTED_CURRENCIES.map((currency) =>
      Currency.updateOne(
        { code: currency.code },
        {
          $set: {
            name: currency.name,
            symbol: currency.symbol,
            decimalPlaces: currency.decimalPlaces ?? 2,
            sortOrder: currency.sortOrder,
            isActive: true,
          },
        },
        { upsert: true },
      ),
    ),
  );

  const total = await Currency.countDocuments();
  console.log(`✅ Currencies seeded (${total} total)`);
};

const getSupportedCurrencyCodes = () =>
  SUPPORTED_CURRENCIES.map((currency) => currency.code);

module.exports = {
  SUPPORTED_CURRENCIES,
  ensureCurrenciesSeeded,
  getSupportedCurrencyCodes,
};
