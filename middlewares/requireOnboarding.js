const User = require("../models/User");
const { errorResponse } = require("../utils/responseHandler");

const requireOnboarding = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select("onboardingCompleted");

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    if (!user.onboardingCompleted) {
      return errorResponse(res, "Please complete onboarding first", 403);
    }

    next();
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = requireOnboarding;
