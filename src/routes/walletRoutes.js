const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listWallets,
  getWallet,
  createWallet,
  updateWallet,
  deleteWallet,
} = require("../controllers/walletController");

const router = express.Router();

router.use(authMiddleware, requireOnboarding);

router.get("/", listWallets);
router.get("/:id", getWallet);
router.post("/", createWallet);
router.patch("/:id", updateWallet);
router.delete("/:id", deleteWallet);

module.exports = router;
