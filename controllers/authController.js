const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const User = require("../models/User");
const OTP = require("../models/OTP");
const Session = require("../models/Session");

const generateOTP = require("../utils/generateOTP");

const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/generateTokens");

const { successResponse, errorResponse } = require("../utils/responseHandler");
const { seedPlansIfEmpty, assignBasicPlanToUser } = require("../utils/planLimits");
const sendEmail = require("../utils/sendEmail");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");

const DEFAULT_ONBOARDING_WALLETS = [
  "Uber Wallet",
  "Rydo Wallet",
  "Uber Eats Wallet",
  "Door Dash Wallet",
];

const DEFAULT_ONBOARDING_CATEGORIES = [
  "Fuel",
  "Maintenance",
  "Repair",
  "Service",
  "Income",
  "Salary",
];

const seedOnboardingTemplatesIfMissing = async () => {
  const [existingWalletTemplates, existingCategoryTemplates] = await Promise.all([
    Wallet.find({
      isDefault: true,
      isDeleted: false,
    })
      .select("walletName")
      .lean(),
    TransactionCategory.find({
      isDefault: true,
      isDeleted: false,
    })
      .select("name")
      .lean(),
  ]);

  const existingWalletNames = new Set(
    existingWalletTemplates.map((wallet) => wallet.walletName),
  );
  const existingCategoryNames = new Set(
    existingCategoryTemplates.map((category) => category.name),
  );

  const walletsToInsert = DEFAULT_ONBOARDING_WALLETS.filter(
    (walletName) => !existingWalletNames.has(walletName),
  ).map((walletName) => ({
    userId: null,
    isDefault: true,
    walletName,
  }));

  const categoriesToInsert = DEFAULT_ONBOARDING_CATEGORIES.filter(
    (name) => !existingCategoryNames.has(name),
  ).map((name) => ({
    userId: null,
    isDefault: true,
    name,
  }));

  if (walletsToInsert.length > 0) {
    await Wallet.insertMany(walletsToInsert);
  }

  if (categoriesToInsert.length > 0) {
    await TransactionCategory.insertMany(categoriesToInsert);
  }
};
/*
|--------------------------------------------------------------------------
| SIGNUP API
|--------------------------------------------------------------------------
*/
const signup = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { fullName, email, password, mobileNumber, currency } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Validate Request
    |--------------------------------------------------------------------------
    */

    if (!fullName || !email || !password || !mobileNumber || !currency) {
      return errorResponse(res, "All fields are required", 400);
    }

    const currencyCode = String(currency).trim().toUpperCase();
    if (currencyCode.length !== 3) {
      return errorResponse(res, "currency must be a 3-letter code", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Email
    |--------------------------------------------------------------------------
    */

    if (!validator.isEmail(email)) {
      return errorResponse(res, "Invalid email", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Mobile Number
    |--------------------------------------------------------------------------
    */

    if (!validator.isMobilePhone(mobileNumber + "")) {
      return errorResponse(res, "Invalid mobile number", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Check Existing User
    |--------------------------------------------------------------------------
    */

    const existingUser = await User.findOne({
      email,
      isDeleted: false,
    });

    if (existingUser) {
      return errorResponse(res, "User already exists", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Hash Password
    |--------------------------------------------------------------------------
    */

    const hashedPassword = await bcrypt.hash(password, 10);

    await seedPlansIfEmpty();

    /*
    |--------------------------------------------------------------------------
    | Create User
    |--------------------------------------------------------------------------
    */

    const user = await User.create(
      [
        {
          fullName,
          email,
          mobileNumber,
          passwordHash: hashedPassword,
          currency: currencyCode,

          // directly verified
          isEmailVerified: true,
        },
      ],
      { session },
    );

    await assignBasicPlanToUser(user[0]._id, session);

    /*
    |--------------------------------------------------------------------------
    | Commit Transaction
    |--------------------------------------------------------------------------
    */

    await session.commitTransaction();

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Signup successful", null, 201);
  } catch (error) {
    await session.abortTransaction();

    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| VERIFY OTP API
|--------------------------------------------------------------------------
*/

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const existingOTP = await OTP.findOne({
      email,
      otp,
      purpose: "FORGOT_PASSWORD",
      verified: false,
    });

    if (!existingOTP) {
      return errorResponse(res, "Invalid OTP", 400);
    }

    if (existingOTP.expiresAt < new Date()) {
      return errorResponse(res, "OTP expired", 400);
    }
    existingOTP.verified = true;

    await existingOTP.save();

    return successResponse(res, "OTP verified successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

/*
|--------------------------------------------------------------------------
| LOGIN API
|--------------------------------------------------------------------------
*/

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Validate Request
    |--------------------------------------------------------------------------
    */

    if (!email || !password) {
      return errorResponse(res, "Email and password are required", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Find User
    |--------------------------------------------------------------------------
    */

    const user = await User.findOne({
      email,
      isDeleted: false,
      status: "ACTIVE",
    }).select("+passwordHash");

    if (!user) {
      return errorResponse(res, "Invalid credentials", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Password Validation
    |--------------------------------------------------------------------------
    */

    const isPasswordMatched = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatched) {
      return errorResponse(res, "Invalid credentials", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Update Last Login
    |--------------------------------------------------------------------------
    */

    user.lastLoginAt = new Date();

    await user.save();

    /*
    |--------------------------------------------------------------------------
    | Generate Tokens
    |--------------------------------------------------------------------------
    */

    const payload = {
      userId: user._id,
      email: user.email,
    };

    const accessToken = generateAccessToken(payload);

    const refreshToken = generateRefreshToken(payload);

    /*
    |--------------------------------------------------------------------------
    | Store Session
    |--------------------------------------------------------------------------
    */

    await Session.create({
      userId: user._id,
      refreshToken,

      deviceInfo: {
        userAgent: req.headers["user-agent"],
      },

      ipAddress: req.ip,

      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    /*
    |--------------------------------------------------------------------------
    | Remove Password Before Response
    |--------------------------------------------------------------------------
    */

    user.passwordHash = undefined;

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Login successful", {
      accessToken,
      refreshToken,
      user,
    });
  } catch (error) {
    console.log(error);

    return errorResponse(res, error.message);
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE ONBOARDING
|--------------------------------------------------------------------------
*/

const completeOnboarding = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await seedOnboardingTemplatesIfMissing();
    session.startTransaction();

    const { selectedWallets = [], selectedCategories = [] } = req.body;

    const userId = req.user.userId;

    /*
    |--------------------------------------------------------------------------
    | Validate Arrays
    |--------------------------------------------------------------------------
    */

    if (!Array.isArray(selectedWallets)) {
      return errorResponse(res, "selectedWallets must be array", 400);
    }

    if (!Array.isArray(selectedCategories)) {
      return errorResponse(res, "selectedCategories must be array", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Fetch Wallet Templates
    |--------------------------------------------------------------------------
    */

    const walletTemplates = await Wallet.find({
      _id: {
        $in: selectedWallets,
      },

      isDefault: true,

      isDeleted: false,
    }).session(session);

    /*
    |--------------------------------------------------------------------------
    | Fetch Category Templates
    |--------------------------------------------------------------------------
    */

    const categoryTemplates = await TransactionCategory.find({
      _id: {
        $in: selectedCategories,
      },

      isDefault: true,

      isDeleted: false,
    }).session(session);

    /*
    |--------------------------------------------------------------------------
    | Create User Wallets
    |--------------------------------------------------------------------------
    */

    let createdWallets = [];

    if (walletTemplates.length > 0) {
      createdWallets = await Wallet.insertMany(
        walletTemplates.map((wallet) => ({
          userId,

          isDefault: false,

          walletName: wallet.walletName,
        })),
        {
          session,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create User Categories
    |--------------------------------------------------------------------------
    */

    let createdCategories = [];

    if (categoryTemplates.length > 0) {
      createdCategories = await TransactionCategory.insertMany(
        categoryTemplates.map((category) => ({
          userId,

          isDefault: false,

          name: category.name,
        })),
        {
          session,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update User
    |--------------------------------------------------------------------------
    */

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        selectedWallets: createdWallets.map((wallet) => wallet._id),

        selectedCategories: createdCategories.map((category) => category._id),

        defaultWalletId:
          createdWallets.length > 0 ? createdWallets[0]._id : null,

        onboardingCompleted: true,
      },
      {
        new: true,
        session,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Commit Transaction
    |--------------------------------------------------------------------------
    */

    await session.commitTransaction();

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(
      res,
      "Onboarding completed successfully",
      updatedUser,
    );
  } catch (error) {
    await session.abortTransaction();

    console.log(error);

    return errorResponse(res, error.message);
  } finally {
    session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| GET ONBOARDING OPTIONS
|--------------------------------------------------------------------------
*/

const getOnboardingOptions = async (req, res) => {
  try {
    await seedOnboardingTemplatesIfMissing();

    /*
    |--------------------------------------------------------------------------
    | Get Default Wallet Templates
    |--------------------------------------------------------------------------
    */

    const wallets = await Wallet.find({
      isDefault: true,
      isDeleted: false,
    }).select("walletName");

    /*
    |--------------------------------------------------------------------------
    | Get Default Category Templates
    |--------------------------------------------------------------------------
    */

    const categories = await TransactionCategory.find({
      isDefault: true,
      isDeleted: false,
    }).select("name");

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Onboarding options fetched successfully", {
      wallets,
      categories,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD API
|--------------------------------------------------------------------------
*/

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Find User
    |--------------------------------------------------------------------------
    */

    const user = await User.findOne({
      email,
      isDeleted: false,
    });

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    /*
    |--------------------------------------------------------------------------
    | Remove Old OTPs
    |--------------------------------------------------------------------------
    */

    await OTP.deleteMany({
      email,
      purpose: "FORGOT_PASSWORD",
    });

    /*
    |--------------------------------------------------------------------------
    | Generate OTP
    |--------------------------------------------------------------------------
    */

    const otp = generateOTP();

    await OTP.create({
      userId: user._id,
      email,
      otp,
      purpose: "FORGOT_PASSWORD",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    /*
    |--------------------------------------------------------------------------
    | Send Email
    |--------------------------------------------------------------------------
    */

    await sendEmail({
      to: email,
      subject: "Forgot Password OTP",
      html: `
        <h2>Forgot Password</h2>

        <p>Your OTP is:</p>

        <h1>${otp}</h1>

        <p>
          This OTP will expire in 5 minutes.
        </p>
      `,
    });

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "OTP sent successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

/*
|--------------------------------------------------------------------------
| REFRESH TOKEN API
|--------------------------------------------------------------------------
*/

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const existingSession = await Session.findOne({
      refreshToken,
    });

    if (!existingSession) {
      return errorResponse(res, "Invalid refresh token", 401);
    }

    const jwt = require("jsonwebtoken");

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const accessToken = generateAccessToken({
      userId: decoded.userId,
      email: decoded.email,
    });

    return successResponse(res, "Token refreshed successfully", {
      accessToken,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

/*
|--------------------------------------------------------------------------
| LOGOUT API
|--------------------------------------------------------------------------
*/

const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user.userId;

    if (!refreshToken) {
      return errorResponse(res, "refreshToken is required", 400);
    }

    const deletedSession = await Session.findOneAndDelete({
      userId,
      refreshToken,
    });

    if (!deletedSession) {
      return errorResponse(res, "Session not found", 404);
    }

    return successResponse(res, "Logout successful");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  signup,
  verifyOTP,
  login,
  completeOnboarding,
  getOnboardingOptions,
  forgotPassword,
  refreshToken,
  logout,
};
