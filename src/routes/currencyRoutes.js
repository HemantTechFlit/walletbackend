const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listCurrencies,
  convertCurrency,
} = require("../controllers/currencyController");

const router = express.Router();

router.get("/", listCurrencies);
router.get("/convert", authMiddleware, requireOnboarding, convertCurrency);

module.exports = router;
