const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const optionalProfileUpload = require("../middlewares/optionalProfileUpload");
const {
  getMe,
  updateMe,
  setDefaultCurrency,
  setDefaultWallet,
  deleteMe,
} = require("../controllers/userController");

const router = express.Router();

router.get("/me", authMiddleware, getMe);
router.patch("/me", authMiddleware, optionalProfileUpload, updateMe);
router.delete("/me", authMiddleware, deleteMe);
router.post(
  "/me/default-currency",
  authMiddleware,
  requireOnboarding,
  setDefaultCurrency,
);
router.post(
  "/me/default-wallet",
  authMiddleware,
  requireOnboarding,
  setDefaultWallet,
);

module.exports = router;
