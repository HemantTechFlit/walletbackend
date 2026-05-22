const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listTransactions,
  getTransaction,
  createTransaction,
  deleteTransaction,
} = require("../controllers/transactionController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listTransactions);
router.get("/:id", getTransaction);
router.post("/", createTransaction);
router.delete("/:id", deleteTransaction);

module.exports = router;
