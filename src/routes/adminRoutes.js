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
const {
  listPlans,
  updatePlan,
} = require("../controllers/adminPlanController");
const {
  listCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency,
} = require("../controllers/adminCurrencyController");
const {
  listLegalDocuments,
  updateLegalDocument,
} = require("../controllers/adminLegalController");
const {
  listUsers,
  getUser,
  updateUserStatus,
} = require("../controllers/adminUserController");
const {
  listSupportSubmissions,
  getSupportSubmission,
  updateSupportSubmission,
} = require("../controllers/adminSupportController");
const {
  getAdminAppSettings,
  updateAdminAppSettings,
} = require("../controllers/adminAppSettingsController");

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

router.get("/plans", adminAuthMiddleware, listPlans);
router.put("/plans/:id", adminAuthMiddleware, updatePlan);

router.get("/currencies", adminAuthMiddleware, listCurrencies);
router.post("/currencies", adminAuthMiddleware, createCurrency);
router.put("/currencies/:id", adminAuthMiddleware, updateCurrency);
router.delete("/currencies/:id", adminAuthMiddleware, deleteCurrency);

router.get("/legal-documents", adminAuthMiddleware, listLegalDocuments);
router.put("/legal-documents/:type", adminAuthMiddleware, updateLegalDocument);

router.get("/users", adminAuthMiddleware, listUsers);
router.get("/users/:id", adminAuthMiddleware, getUser);
router.patch("/users/:id/status", adminAuthMiddleware, updateUserStatus);

router.get("/support-submissions", adminAuthMiddleware, listSupportSubmissions);
router.get("/support-submissions/:id", adminAuthMiddleware, getSupportSubmission);
router.patch(
  "/support-submissions/:id",
  adminAuthMiddleware,
  updateSupportSubmission,
);

router.get("/app-settings", adminAuthMiddleware, getAdminAppSettings);
router.put("/app-settings", adminAuthMiddleware, updateAdminAppSettings);

module.exports = router;
