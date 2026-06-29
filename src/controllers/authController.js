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
const {
  seedPlansIfEmpty,
  assignBasicPlanToUser,
} = require("../utils/planLimits");
const sendEmail = require("../utils/sendEmail");
const { verifyProviderIdToken } = require("../utils/socialAuth");
const { assertActiveCurrency } = require("../services/exchangeRateService");
const { buildUserProfilePayload } = require("../utils/userProfile");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const TransactionCategory = require("../models/TransactionCategory");
const {
  formatWalletOption,
  groupCategoriesByType,
} = require("../services/onboardingTemplateService");

const ACCOUNT_DEACTIVATED_MESSAGE =
  "Your account is deactivated. Please contact with the admin";

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

const parseOpeningAmount = (value, fieldName, { allowNegative = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    return { value: 0 };
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || (!allowNegative && parsed < 0)) {
    return {
      error: allowNegative
        ? `${fieldName} must be a valid number`
        : `${fieldName} must be a non-negative number`,
    };
  }

  return { value: parsed };
};

const toOrderedWalletEntries = (items) => {
  const entries = [];

  for (const item of items) {
    if (typeof item === "string") {
      entries.push({ kind: "template", value: item });
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.walletName) {
      entries.push({ kind: "custom", data: item });
      continue;
    }

    const templateRef = item._id || item.id;
    if (templateRef) {
      entries.push({ kind: "template", value: templateRef });
    }
  }

  return entries;
};

const toOrderedCategoryEntries = (items) => {
  const entries = [];

  for (const item of items) {
    if (typeof item === "string") {
      entries.push({ kind: "template", value: item });
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const templateRef = item._id || item.id;
    if (templateRef) {
      entries.push({ kind: "template", value: templateRef });
      continue;
    }

    if (item.name) {
      entries.push({ kind: "custom", data: item });
    }
  }

  return entries;
};

const buildWalletTemplateMap = (templates) => {
  const map = new Map();

  for (const template of templates) {
    map.set(template._id.toString(), template);
    if (template.slug) {
      map.set(template.slug.toLowerCase(), template);
    }
  }

  return map;
};

const buildCategoryTemplateMap = (templates) => {
  const map = new Map();

  for (const template of templates) {
    map.set(template._id.toString(), template);
    if (template.slug) {
      map.set(template.slug.toLowerCase(), template);
    }
  }

  return map;
};

const resolveWalletTemplate = (value, templateMap) => {
  const key = String(value).trim();
  if (!key) {
    return null;
  }

  if (mongoose.isValidObjectId(key)) {
    return templateMap.get(key) || null;
  }

  return templateMap.get(key.toLowerCase()) || null;
};

const resolveCategoryTemplate = (value, templateMap) => {
  const key = String(value).trim();
  if (!key) {
    return null;
  }

  if (mongoose.isValidObjectId(key)) {
    return templateMap.get(key) || null;
  }

  return templateMap.get(key.toLowerCase()) || null;
};

const buildCustomWalletSpec = async (data, userId, defaultCurrencyCode) => {
  const {
    walletName,
    color,
    icon,
    currency,
    incomeTotal,
    expenseTotal,
    balance,
  } = data;

  if (!walletName || typeof walletName !== "string" || !walletName.trim()) {
    return { error: "walletName is required for custom wallets" };
  }

  let currencyCode = defaultCurrencyCode;
  if (currency !== undefined && String(currency).trim() !== "") {
    try {
      const activeCurrency = await assertActiveCurrency(currency);
      currencyCode = activeCurrency.code;
    } catch (error) {
      return { error: error.message };
    }
  }

  const parsedIncomeTotal = parseOpeningAmount(incomeTotal, "incomeTotal");
  if (parsedIncomeTotal.error) {
    return { error: parsedIncomeTotal.error };
  }

  const parsedExpenseTotal = parseOpeningAmount(expenseTotal, "expenseTotal");
  if (parsedExpenseTotal.error) {
    return { error: parsedExpenseTotal.error };
  }

  const parsedBalance = parseOpeningAmount(balance, "balance", {
    allowNegative: true,
  });
  if (parsedBalance.error) {
    return { error: parsedBalance.error };
  }

  const openingAmount =
    balance === undefined || balance === null || balance === ""
      ? parsedIncomeTotal.value - parsedExpenseTotal.value
      : parsedBalance.value;

  const doc = {
    userId,
    isDefault: false,
    walletName: walletName.trim(),
    incomeTotal: 0,
    expenseTotal: 0,
    balance: 0,
    currency: currencyCode,
  };

  if (color !== undefined) {
    doc.color = String(color).trim();
  }

  if (icon !== undefined) {
    doc.icon = String(icon).trim();
  }

  return { doc, openingAmount };
};

const buildCustomCategoryDoc = (data, userId, seenNames) => {
  const { name, color, icon, type } = data;

  if (!name || typeof name !== "string" || !name.trim()) {
    return { error: "name is required for custom categories" };
  }

  const trimmed = name.trim();
  const normalizedName = trimmed.toLowerCase();

  if (seenNames.has(normalizedName)) {
    return { error: "Category with this name already exists" };
  }

  if (type !== undefined && !["INCOME", "EXPENSE"].includes(type)) {
    return { error: "type must be INCOME or EXPENSE" };
  }

  seenNames.add(normalizedName);

  const doc = {
    userId,
    isDefault: false,
    name: trimmed,
    type: type || "EXPENSE",
  };

  if (color !== undefined) {
    doc.color = String(color).trim();
  }

  if (icon !== undefined) {
    doc.icon = String(icon).trim();
  }

  return { doc };
};

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

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

  const responseUser = await buildUserProfilePayload(user._id);

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
  const currency = String(body.currency || "AUD")
    .trim()
    .toUpperCase();

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
    user = await User.findOne({ email, isDeleted: false }).select(
      "+passwordHash",
    );
  }

  if (user && user.status !== "ACTIVE") {
    const error = new Error(ACCOUNT_DEACTIVATED_MESSAGE);
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
    const existingProviderEntry = (user.authProviders || []).find(
      (entry) =>
        entry.provider === provider && entry.providerUserId === providerUserId,
    );

    user.authProviders = [
      ...(user.authProviders || []).filter(
        (entry) => entry.provider !== provider,
      ),
      existingProviderEntry || providerEntry,
    ];

    return user;
  }

  if (!email) {
    const error = new Error(
      "Email is required from social provider for first login",
    );
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

    const { fullName, email, password, mobileNumber } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Validate Request
    |--------------------------------------------------------------------------
    */

    if (!fullName || !email || !password || !mobileNumber) {
      return errorResponse(res, "All fields are required", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Email
    |--------------------------------------------------------------------------
    */

    if (!validator.isEmail(email)) {
      return errorResponse(res, "Invalid email", 400);
    }

    const normalizedMobile = String(mobileNumber).trim();
    if (!validator.isMobilePhone(normalizedMobile)) {
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
          mobileNumber: normalizedMobile,
          passwordHash: hashedPassword,
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
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

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
    }).select("+passwordHash");

    if (!user) {
      return errorResponse(res, "Email not registered", 400);
    }

    if (user.status !== "ACTIVE") {
      return errorResponse(res, ACCOUNT_DEACTIVATED_MESSAGE, 403);
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
    session.startTransaction();

    const {
      selectedWallets = [],
      selectedCategories = [],
      defaultCurrency,
    } = req.body;

    const userId = req.user.userId;

    const existingUser = await User.findById(userId)
      .select("onboardingCompleted")
      .session(session);

    if (!existingUser) {
      await session.abortTransaction();
      return errorResponse(res, "User not found", 404);
    }

    if (existingUser.onboardingCompleted) {
      await session.abortTransaction();
      return errorResponse(res, "Onboarding has already been completed", 403);
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Arrays
    |--------------------------------------------------------------------------
    */

    if (!defaultCurrency || !String(defaultCurrency).trim()) {
      return errorResponse(res, "defaultCurrency is required", 400);
    }

    let defaultCurrencyCode;
    try {
      const activeCurrency = await assertActiveCurrency(defaultCurrency);
      defaultCurrencyCode = activeCurrency.code;
    } catch (error) {
      return errorResponse(res, error.message, error.statusCode || 400);
    }

    if (!Array.isArray(selectedWallets)) {
      return errorResponse(res, "selectedWallets must be array", 400);
    }

    if (!Array.isArray(selectedCategories)) {
      return errorResponse(res, "selectedCategories must be array", 400);
    }

    /*
    |--------------------------------------------------------------------------
    | Resolve Wallet And Category Entries
    |--------------------------------------------------------------------------
    */

    const walletEntries = toOrderedWalletEntries(selectedWallets);
    const categoryEntries = toOrderedCategoryEntries(selectedCategories);

    const walletTemplateFilters = normalizeOnboardingSelections(
      walletEntries
        .filter((entry) => entry.kind === "template")
        .map((entry) => entry.value),
    );
    const walletTemplates = await Wallet.find(
      buildTemplateSelectionQuery(walletTemplateFilters),
    ).session(session);
    const walletTemplateMap = buildWalletTemplateMap(walletTemplates);

    const categoryTemplateFilters = normalizeOnboardingSelections(
      categoryEntries
        .filter((entry) => entry.kind === "template")
        .map((entry) => entry.value),
    );
    const categoryTemplates = await TransactionCategory.find(
      buildTemplateSelectionQuery(categoryTemplateFilters),
    ).session(session);
    const categoryTemplateMap = buildCategoryTemplateMap(categoryTemplates);

    const walletSpecs = [];

    for (const entry of walletEntries) {
      if (entry.kind === "template") {
        const template = resolveWalletTemplate(entry.value, walletTemplateMap);
        if (!template) {
          await session.abortTransaction();
          return errorResponse(
            res,
            `Wallet template not found: ${entry.value}`,
            400,
          );
        }

        walletSpecs.push({
          doc: {
            userId,
            isDefault: false,
            walletName: template.walletName,
            slug: template.slug,
            description: template.description,
            icon: template.icon,
            color: template.color,
            currency: defaultCurrencyCode,
            sortOrder: template.sortOrder,
          },
        });
        continue;
      }

      const customWallet = await buildCustomWalletSpec(
        entry.data,
        userId,
        defaultCurrencyCode,
      );
      if (customWallet.error) {
        await session.abortTransaction();
        return errorResponse(res, customWallet.error, 400);
      }

      walletSpecs.push(customWallet);
    }

    const categoryDocs = [];
    const seenCategoryNames = new Set();

    for (const entry of categoryEntries) {
      if (entry.kind === "template") {
        const template = resolveCategoryTemplate(
          entry.value,
          categoryTemplateMap,
        );
        if (!template) {
          await session.abortTransaction();
          return errorResponse(
            res,
            `Category template not found: ${entry.value}`,
            400,
          );
        }

        categoryDocs.push({
          userId,
          isDefault: false,
          name: template.name,
          slug: template.slug,
          description: template.description,
          icon: template.icon,
          color: template.color,
          sortOrder: template.sortOrder,
          type: template.type || "EXPENSE",
        });
        continue;
      }

      const customCategory = buildCustomCategoryDoc(
        entry.data,
        userId,
        seenCategoryNames,
      );
      if (customCategory.error) {
        await session.abortTransaction();
        return errorResponse(res, customCategory.error, 400);
      }

      categoryDocs.push(customCategory.doc);
    }

    /*
    |--------------------------------------------------------------------------
    | Create User Wallets
    |--------------------------------------------------------------------------
    */

    let createdWallets = [];

    if (walletSpecs.length > 0) {
      createdWallets = await Wallet.insertMany(
        walletSpecs.map((spec) => spec.doc),
        { session },
      );

      for (let index = 0; index < createdWallets.length; index += 1) {
        const openingAmount = walletSpecs[index].openingAmount || 0;
        if (openingAmount === 0) {
          continue;
        }

        const wallet = createdWallets[index];
        await WalletTransaction.create(
          [
            {
              userId,
              walletId: wallet._id,
              categoryId: null,
              type: openingAmount > 0 ? "INCOME" : "EXPENSE",
              amount: Math.abs(openingAmount),
              title: "Opening balance",
              description: null,
              transactionDate: new Date(),
              categorySnapshot: null,
              walletSnapshot: {
                walletName: wallet.walletName,
                walletColor: wallet.color,
              },
              createdBy: userId,
            },
          ],
          { session },
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Create User Categories
    |--------------------------------------------------------------------------
    */

    let createdCategories = [];

    if (categoryDocs.length > 0) {
      createdCategories = await TransactionCategory.insertMany(categoryDocs, {
        session,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Update User
    |--------------------------------------------------------------------------
    */

    await User.findByIdAndUpdate(
      userId,
      {
        selectedWallets: createdWallets.map((wallet) => wallet._id),

        selectedCategories: createdCategories.map((category) => category._id),

        defaultWalletId:
          createdWallets.length > 0 ? createdWallets[0]._id : null,

        currency: defaultCurrencyCode,

        onboardingCompleted: true,
      },
      {
        session,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Commit Transaction
    |--------------------------------------------------------------------------
    */

    await session.commitTransaction();

    const userPayload = await buildUserProfilePayload(userId);

    if (!userPayload) {
      return errorResponse(res, "User not found", 404);
    }

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Onboarding completed successfully", {
      user: userPayload,
    });
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
      .select("name slug description icon color sortOrder type")
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    /*
    |--------------------------------------------------------------------------
    | Success Response
    |--------------------------------------------------------------------------
    */

    return successResponse(res, "Onboarding options fetched successfully", {
      wallets: wallets.map(formatWalletOption),
      categories: groupCategoriesByType(categories),
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
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

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
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

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
