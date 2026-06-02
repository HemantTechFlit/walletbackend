const express = require("express");

const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");

const {
  signup,
  verifyOTP,
  login,
  googleLogin,
  appleLogin,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  completeOnboarding,
  getOnboardingOptions,
} = require("../controllers/authController");

router.post("/signup", signup);

router.post("/verify-otp", verifyOTP);

router.post("/login", login);

router.post("/google", googleLogin);

router.post("/apple", appleLogin);

router.post("/complete-onboarding", authMiddleware, completeOnboarding);

router.get("/onboarding-options", authMiddleware, getOnboardingOptions);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.post("/refresh-token", refreshToken);

router.post("/logout", authMiddleware, logout);

module.exports = router;
