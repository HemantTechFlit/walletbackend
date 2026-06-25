const express = require("express");

const router = express.Router();
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");
const {
  login,
  me,
  refreshToken,
  logout,
} = require("../controllers/adminController");
const {
  listOnboardingWallets,
  createOnboardingWallet,
  updateOnboardingWallet,
  deleteOnboardingWallet,
  listOnboardingCategories,
  createOnboardingCategory,
  updateOnboardingCategory,
  deleteOnboardingCategory,
} = require("../controllers/adminOnboardingController");

router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.get("/me", adminAuthMiddleware, me);
router.post("/logout", adminAuthMiddleware, logout);

router.get("/onboarding/wallets", adminAuthMiddleware, listOnboardingWallets);
router.post("/onboarding/wallets", adminAuthMiddleware, createOnboardingWallet);
router.put("/onboarding/wallets/:id", adminAuthMiddleware, updateOnboardingWallet);
router.delete("/onboarding/wallets/:id", adminAuthMiddleware, deleteOnboardingWallet);

router.get("/onboarding/categories", adminAuthMiddleware, listOnboardingCategories);
router.post("/onboarding/categories", adminAuthMiddleware, createOnboardingCategory);
router.put("/onboarding/categories/:id", adminAuthMiddleware, updateOnboardingCategory);
router.delete(
  "/onboarding/categories/:id",
  adminAuthMiddleware,
  deleteOnboardingCategory,
);

module.exports = router;
