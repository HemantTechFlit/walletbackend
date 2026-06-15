const express = require("express");
const {
  listCurrencies,
  convertCurrency,
} = require("../controllers/currencyController");

const router = express.Router();

router.get("/", listCurrencies);
router.get("/convert", convertCurrency);

module.exports = router;
