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
const { verifyProviderIdToken } = require("../utils/socialAuth");
const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");

const DEFAULT_ONBOARDING_WALLETS = [
  {
    slug: "uber",
    walletName: "Uber Wallet",
    description: "",
    icon: "CustomIcons.uber",
    color: "0xff000000",
    currency: "USD",
    sortOrder: 1,
    aliases: ["Uber Wallet"],
  },
  {
    slug: "rydo",
    walletName: "Rydo Wallet",
    description: "",
    icon: "CustomIcons.rydo",
    color: "0xffff9518",
    currency: "USD",
    sortOrder: 2,
    aliases: ["Rydo Wallet"],
  },
  {
    slug: "ubereats",
    walletName: "Uber Eats Wallet",
    description: "",
    icon: "CustomIcons.ubereats",
    color: "0xff06c167",
    currency: "USD",
    sortOrder: 3,
    aliases: ["Uber Eats Wallet"],
  },
  {
    slug: "doordash",
    walletName: "DoorDash Wallet",
    description: "",
    icon: "CustomIcons.doordash",
    color: "0xfff72e08",
    currency: "USD",
    sortOrder: 4,
    aliases: ["DoorDash Wallet", "Door Dash Wallet"],
  },
];

const DEFAULT_ONBOARDING_CATEGORIES = [
  {
    slug: "fuel",
    name: "Fuel",
    description: "",
    icon: "CustomIcons.catFuel",
    color: "0xff4549ff",
    sortOrder: 1,
    aliases: ["Fuel"],
  },
  {
    slug: "service",
    name: "Service",
    description: "",
    icon: "CustomIcons.catService",
    color: "0xfff77b00",
    sortOrder: 2,
    aliases: ["Service"],
  },
  {
    slug: "maintenance",
    name: "Maintenance",
    description: "",
    icon: "CustomIcons.catMaintenance",
    color: "0xfff72e08",
    sortOrder: 3,
    aliases: ["Maintenance"],
  },
  {
    slug: "repair",
    name: "Repair",
    description: "",
    icon: "CustomIcons.catRepair",
    color: "0xff48FFC3",
    sortOrder: 4,
    aliases: ["Repair"],
  },
  {
    slug: "salary",
    name: "Salary (Cash out)",
    description: "",
    icon: "CustomIcons.catPayout",
    color: "0xff5cb109",
    sortOrder: 5,
    aliases: ["Salary (Cash out)", "Salary"],
  },
  {
    slug: "loan",
    name: "Loan",
    description: "",
    icon: "CustomIcons.catLoan",
    color: "0xffFFA800",
    sortOrder: 6,
    aliases: ["Loan"],
  },
  {
    slug: "borrowed",
    name: "Borrowed",
    description: "",
    icon: "CustomIcons.catBorrow",
    color: "0xff0095FF",
    sortOrder: 7,
    aliases: ["Borrowed"],
  },
];

const stripAliases = ({ aliases, ...item }) => item;

const seedOnboardingTemplatesIfMissing = async () => {
  await Promise.all(
    DEFAULT_ONBOARDING_WALLETS.map(async (wallet) => {
      const existingWallet = await Wallet.findOne({
        isDefault: true,
        isDeleted: false,
        $or: [
          { slug: wallet.slug },
          { walletName: { $in: wallet.aliases } },
        ],
      });

      const walletData = {
        ...stripAliases(wallet),
        userId: null,
        isDefault: true,
      };

      if (existingWallet) {
        await Wallet.updateOne(
          { _id: existingWallet._id },
          { $set: { ...walletData, updatedAt: new Date() } },
        );
        return;
      }

      await Wallet.create(walletData);
    }),
  );

  await Promise.all(
    DEFAULT_ONBOARDING_CATEGORIES.map(async (category) => {
      const existingCategory = await TransactionCategory.findOne({
        isDefault: true,
        isDeleted: false,
        $or: [
          { slug: category.slug },
          { name: { $in: category.aliases } },
        ],
      });

      const categoryData = {
        ...stripAliases(category),
        userId: null,
        isDefault: true,
      };

      if (existingCategory) {
        await TransactionCategory.updateOne(
          { _id: existingCategory._id },
          { $set: { ...categoryData, updatedAt: new Date() } },
        );
        return;
      }

      await TransactionCategory.create(categoryData);
    }),
  );

  await Promise.all([
    Wallet.updateMany(
      {
        isDefault: true,
        userId: null,
        slug: { $nin: DEFAULT_ONBOARDING_WALLETS.map((wallet) => wallet.slug) },
      },
      { $set: { isDeleted: true, updatedAt: new Date() } },
    ),
    TransactionCategory.updateMany(
      {
        isDefault: true,
        userId: null,
        slug: {
          $nin: DEFAULT_ONBOARDING_CATEGORIES.map((category) => category.slug),
        },
      },
      { $set: { isDeleted: true, updatedAt: new Date() } },
    ),
  ]);
};

const normalizeOnboardingSelections = (items) => {
  return items.reduce(
    (acc, item) => {
      const rawValue =
        typeof item === "object" && item !== null ? item._id || item.id : item;

      if (!rawValue) {
        return acc;
      }

      const value = String(rawValue).trim();

      if (mongoose.isValidObjectId(value)) {
        acc.objectIds.push(value);
      } else {
        acc.slugs.push(value.toLowerCase());
      }

      return acc;
    },
    { objectIds: [], slugs: [] },
  );
};

const buildTemplateSelectionQuery = ({ objectIds, slugs }) => {
  const filters = [];

  if (objectIds.length > 0) {
    filters.push({ _id: { $in: objectIds } });
  }

  if (slugs.length > 0) {
    filters.push({ slug: { $in: slugs } });
  }

  return {
    isDefault: true,
    isDeleted: false,
    ...(filters.length > 0 ? { $or: filters } : { _id: { $in: [] } }),
  };
};

const formatWalletOption = (wallet) => ({
  _id: wallet._id,
  id: wallet.slug,
  name: wallet.walletName,
  description: wallet.description || "",
  icon: wallet.icon || wallet.slug,
  color: wallet.color,
  currency: wallet.currency || "USD",
});

const formatCategoryOption = (category) => ({
  _id: category._id,
  id: category.slug,
  name: category.name,
  description: category.description || "",
  icon: category.icon || category.slug,
  color: category.color,
});

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const createAuthSession = async ({ user, req }) => {
  user.lastLoginAt = new Date();
  await user.save();

  const payload = {
    userId: user._id,
    email: user.email,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await Session.create({
    userId: user._id,
    refreshToken,
    deviceInfo: {
      userAgent: req.headers["user-agent"],
    },
    ipAddress: req.ip,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const responseUser = user.toObject ? user.toObject() : user;
  delete responseUser.passwordHash;

  return {
    accessToken,
    refreshToken,
    user: responseUser,
  };
};

const getSocialProviderInput = (provider, body) => {
  const normalizedProvider = provider.toUpperCase();
  const fullName =
    typeof body.fullName === "string" && body.fullName.trim()
      ? body.fullName.trim()
      : null;
  const currency = String(body.currency || "AUD").trim().toUpperCase();

  return {
    provider: normalizedProvider,
    idToken: body.idToken || body.identityToken || body.token,
    fullName,
    currency: currency.length === 3 ? currency : "AUD",
  };
};

const upsertSocialUser = async ({ provider, claims, fullName, currency }) => {
  const providerUserId = claims.sub;
  const email = normalizeEmail(claims.email);
  const providerFilter = {
    authProviders: {
      $elemMatch: {
        provider,
        providerUserId,
      },
    },
    isDeleted: false,
  };

  let user = await User.findOne(providerFilter).select("+passwordHash");

  if (!user && email) {
    user = await User.findOne({ email, isDeleted: false }).select("+passwordHash");
  }

  if (user && user.status !== "ACTIVE") {
    const error = new Error("User is not active");
    error.statusCode = 403;
    throw error;
  }

  const providerEntry = {
    provider,
    providerUserId,
    email,
    linkedAt: new Date(),
  };

  if (user) {
    const alreadyLinked = (user.authProviders || []).some(
      (entry) =>
        entry.provider === provider && entry.providerUserId === providerUserId,
    );

    if (!alreadyLinked) {
      user.authProviders = [...(user.authProviders || []), providerEntry];
    }

    return user;
  }

  if (!email) {
    const error = new Error("Email is required from social provider for first login");
    error.statusCode = 400;
    throw error;
  }

  await seedPlansIfEmpty();

  user = await User.create({
    fullName: fullName || claims.name || email.split("@")[0],
    email,
    currency,
    onboardingCompleted: false,
    status: "ACTIVE",
    authProviders: [providerEntry],
  });

  await assignBasicPlanToUser(user._id);

  return user;
};

const socialLogin = (providerName) => async (req, res) => {
  try {
    const { provider, idToken, fullName, currency } = getSocialProviderInput(
      providerName,
      req.body,
    );

    const claims = await verifyProviderIdToken({
      provider: providerName,
      idToken,
    });

    const user = await upsertSocialUser({
      provider,
      claims,
      fullName,
      currency,
    });

    const data = await createAuthSession({ user, req });

    return successResponse(res, `${provider} login successful`, data);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 400);
  }
};

const googleLogin = socialLogin("google");
const appleLogin = socialLogin("apple");
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
          authProviders: [
            {
              provider: "PASSWORD",
              providerUserId: email.toLowerCase(),
              email: email.toLowerCase(),
            },
          ],

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
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const existingOTP = await OTP.findOne({
      email: normalizedEmail,
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
      return errorResponse(res, "Email not registered", 400);
    }

    if (!user.passwordHash) {
      return errorResponse(res, "Please sign in with your social account", 400);
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

    const data = await createAuthSession({ user, req });

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Login successful", {
      ...data,
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

    const selectedWalletFilters = normalizeOnboardingSelections(selectedWallets);
    const walletTemplates = await Wallet.find(
      buildTemplateSelectionQuery(selectedWalletFilters),
    ).session(session);

    /*
    |--------------------------------------------------------------------------
    | Fetch Category Templates
    |--------------------------------------------------------------------------
    */

    const selectedCategoryFilters =
      normalizeOnboardingSelections(selectedCategories);
    const categoryTemplates = await TransactionCategory.find(
      buildTemplateSelectionQuery(selectedCategoryFilters),
    ).session(session);

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

          slug: wallet.slug,

          description: wallet.description,

          icon: wallet.icon,

          color: wallet.color,

          currency: wallet.currency,

          sortOrder: wallet.sortOrder,
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

          slug: category.slug,

          description: category.description,

          icon: category.icon,

          color: category.color,

          sortOrder: category.sortOrder,
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
    })
      .select("walletName slug description icon color currency sortOrder")
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    /*
    |--------------------------------------------------------------------------
    | Get Default Category Templates
    |--------------------------------------------------------------------------
    */

    const categories = await TransactionCategory.find({
      isDefault: true,
      isDeleted: false,
    })
      .select("name slug description icon color sortOrder")
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Onboarding options fetched successfully", {
      wallets: wallets.map(formatWalletOption),
      categories: categories.map(formatCategoryOption),
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
    const normalizedEmail = String(email || "").trim().toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | Find User
    |--------------------------------------------------------------------------
    */

    const user = await User.findOne({
      email: normalizedEmail,
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
      email: normalizedEmail,
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
      email: normalizedEmail,
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
      to: normalizedEmail,
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
| RESET PASSWORD API
|--------------------------------------------------------------------------
*/

const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmNewPassword } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return errorResponse(res, "email is required", 400);
    }

    if (!validator.isEmail(normalizedEmail)) {
      return errorResponse(res, "Invalid email", 400);
    }

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      !newPassword.trim()
    ) {
      return errorResponse(res, "newPassword is required", 400);
    }

    if (
      !confirmNewPassword ||
      typeof confirmNewPassword !== "string" ||
      !confirmNewPassword.trim()
    ) {
      return errorResponse(res, "confirmNewPassword is required", 400);
    }

    if (newPassword !== confirmNewPassword) {
      return errorResponse(res, "Passwords do not match", 400);
    }

    const verifiedOTP = await OTP.findOne({
      email: normalizedEmail,
      purpose: "FORGOT_PASSWORD",
      verified: true,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!verifiedOTP) {
      return errorResponse(res, "OTP verification required", 400);
    }

    const user = await User.findOne({
      _id: verifiedOTP.userId,
      email: normalizedEmail,
      isDeleted: false,
      status: "ACTIVE",
    }).select("+passwordHash");

    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    await user.save();

    await Promise.all([
      OTP.deleteMany({
        userId: user._id,
        purpose: "FORGOT_PASSWORD",
      }),
      Session.deleteMany({ userId: user._id }),
    ]);

    return successResponse(res, "Password reset successfully");
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
  googleLogin,
  appleLogin,
  completeOnboarding,
  getOnboardingOptions,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
};
