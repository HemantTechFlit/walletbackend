const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const optionalReceiptUpload = require("../middlewares/optionalReceiptUpload");
const {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} = require("../controllers/transactionController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listTransactions);
router.get("/:id", getTransaction);
router.post("/", optionalReceiptUpload, createTransaction);
router.patch("/:id", optionalReceiptUpload, updateTransaction);
router.delete("/:id", deleteTransaction);

module.exports = router;
