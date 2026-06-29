const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Wallet Backend API",
      version: "1.0.0",
      description:
        "Expense / income tracker backend: authentication, admin panel auth, onboarding, users, wallets, categories, transactions, transfers, reports, and subscriptions.",
    },
    servers: [
      {
        url: "https://expense-tracker-ip37.onrender.com",
        description: "Expense Tracker API production server",
      },

      // {
      //   url: "http://localhost:3000",
      //   description: "Local development server",
      // },
    ],
    tags: [
      { name: "Auth", description: "Authentication APIs" },
      {
        name: "Admin",
        description:
          "Admin panel authentication and management of onboarding templates, subscription plans, and supported currencies (default admin seeded from ADMIN_USERNAME / ADMIN_PASSWORD on server start)",
      },
      { name: "Onboarding", description: "Onboarding APIs" },
      { name: "Users", description: "Current user profile and preferences" },
      {
        name: "Wallets",
        description: "User wallets (requires completed onboarding)",
      },
      { name: "Categories", description: "Transaction categories" },
      { name: "Transactions", description: "Income and expense entries" },
      {
        name: "Planned Payments",
        description: "Manual planned income/expense reminders",
      },
      { name: "Transfers", description: "Wallet-to-wallet transfers" },
      { name: "Voice", description: "AI-assisted voice transaction drafts" },
      {
        name: "Reports",
        description: "CSV/PDF/receipt reports returned as JSON",
      },
      {
        name: "Subscriptions",
        description: "User subscription and effective plan",
      },
      {
        name: "Support",
        description: "Help center, bug reports, and feature requests",
      },
      {
        name: "App Settings",
        description: "Mobile app configuration, ads, and URLs",
      },
      {
        name: "Currencies",
        description:
          "Public currency list and live conversion preview (no auth)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "User access token from POST /api/auth/login or social auth.",
        },
        adminBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Admin access token from POST /api/admin/login (JWT payload includes role: admin).",
        },
        appSettingsApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Request successful" },
            data: { type: "object", nullable: true },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Something went wrong" },
          },
        },
        AppSettingsJson: {
          type: "object",
          properties: {
            appConfig: {
              type: "object",
              properties: {
                version: { type: "string", example: "1.0.0" },
              },
            },
            adsConfig: { type: "object" },
            urlConfig: { type: "object" },
          },
        },
        SignupRequest: {
          type: "object",
          required: ["fullName", "email", "password", "mobileNumber"],
          properties: {
            fullName: { type: "string", example: "Hemant Kumar" },
            email: { type: "string", example: "hemant@gmail.com" },
            password: { type: "string", example: "Password@123" },
            mobileNumber: { type: "string", example: "9876543210" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "hemant@gmail.com" },
            password: { type: "string", example: "Password@123" },
          },
        },
        SocialAuthRequest: {
          type: "object",
          required: ["idToken"],
          properties: {
            idToken: {
              type: "string",
              description:
                "Firebase Auth ID token after Google Sign-In or Apple Sign-In.",
            },
            fullName: {
              type: "string",
              description:
                "Optional. Useful for Apple first sign-in when name is only returned by the client.",
              example: "Hemant Kumar",
            },
            currency: {
              type: "string",
              description:
                "Optional ISO 4217 currency code for first-time social users.",
              example: "USD",
            },
          },
        },
        VerifyOtpRequest: {
          type: "object",
          required: ["email", "otp"],
          properties: {
            email: { type: "string", example: "hemant@gmail.com" },
            otp: { type: "string", example: "123456" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", example: "hemant@gmail.com" },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["email", "newPassword", "confirmNewPassword"],
          properties: {
            email: { type: "string", example: "hemant@gmail.com" },
            newPassword: { type: "string", example: "NewPassword@123" },
            confirmNewPassword: { type: "string", example: "NewPassword@123" },
          },
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", example: "eyJhbGciOiJI..." },
          },
        },
        LogoutRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", example: "eyJhbGciOiJI..." },
          },
        },
        CompleteOnboardingRequest: {
          type: "object",
          required: [
            "selectedWallets",
            "selectedCategories",
            "defaultCurrency",
          ],
          properties: {
            selectedWallets: {
              type: "array",
              description:
                "Onboarding wallet templates (Mongo _id or slug like doordash) and/or custom wallets using the same fields as POST /api/wallets.",
              items: {
                oneOf: [
                  { type: "string", example: "doordash" },
                  { $ref: "#/components/schemas/CreateWalletRequest" },
                ],
              },
              example: [
                "doordash",
                {
                  walletName: "Cash Wallet",
                  color: "0xff06c167",
                  icon: "CustomIcons.wallet",
                  balance: 5000,
                },
              ],
            },
            selectedCategories: {
              type: "array",
              description:
                "Onboarding category templates (Mongo _id or slug like fuel) and/or custom categories using the same fields as POST /api/categories.",
              items: {
                oneOf: [
                  { type: "string", example: "fuel" },
                  { $ref: "#/components/schemas/CreateCategoryRequest" },
                ],
              },
              example: [
                "fuel",
                {
                  name: "Groceries",
                  color: "0xff4549ff",
                  icon: "CustomIcons.catFood",
                  type: "EXPENSE",
                },
              ],
            },
            defaultCurrency: {
              type: "string",
              description:
                "User's default currency. Applied to template wallets and custom wallets without an explicit currency.",
              example: "INR",
              minLength: 3,
              maxLength: 3,
            },
          },
        },
        OnboardingWalletOption: {
          type: "object",
          properties: {
            _id: { type: "string", example: "6820752aebf84d7a6394c164" },
            id: { type: "string", example: "doordash" },
            name: { type: "string", example: "DoorDash Wallet" },
            description: { type: "string", example: "" },
            icon: { type: "string", example: "CustomIcons.doordash" },
            color: { type: "string", example: "0xfff72e08" },
            currency: { type: "string", example: "USD" },
          },
        },
        OnboardingCategoryOption: {
          type: "object",
          properties: {
            _id: { type: "string", example: "6820752aebf84d7a6394c16a" },
            id: { type: "string", example: "fuel" },
            name: { type: "string", example: "Fuel" },
            description: { type: "string", example: "" },
            icon: { type: "string", example: "CustomIcons.catFuel" },
            color: { type: "string", example: "0xff4549ff" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
            },
          },
        },
        OnboardingCategoriesByType: {
          type: "object",
          properties: {
            income: {
              type: "array",
              items: { $ref: "#/components/schemas/OnboardingCategoryOption" },
            },
            expense: {
              type: "array",
              items: { $ref: "#/components/schemas/OnboardingCategoryOption" },
            },
          },
        },
        UpdateUserRequest: {
          type: "object",
          description:
            "JSON body when not uploading a file. For profile photo use multipart instead.",
          properties: {
            fullName: { type: "string", example: "Jane Doe" },
            mobileNumber: { type: "string", example: "9876543210" },
            profileImage: {
              type: "string",
              nullable: true,
              description: "Optional manual URL (JSON requests only)",
            },
            removeProfileImage: {
              type: "boolean",
              description:
                "Set true to clear profileImage (multipart form field)",
            },
          },
        },
        UpdateUserMultipartRequest: {
          type: "object",
          description:
            "multipart/form-data. Image is uploaded to Cloudflare R2 and the link is saved on the user.",
          properties: {
            fullName: { type: "string", example: "Hemant Kumar" },
            mobileNumber: { type: "string", example: "9876543210" },
            profileImage: {
              type: "string",
              format: "binary",
              description:
                "Profile picture file (JPEG, PNG, WebP, GIF, max 5MB)",
            },
            removeProfileImage: {
              type: "string",
              example: "false",
              description: "Set to true to remove profile picture",
            },
          },
        },
        SetDefaultWalletRequest: {
          type: "object",
          required: ["walletId"],
          properties: {
            walletId: {
              type: "string",
              example: "6820752aebf84d7a6394c164",
            },
          },
        },
        SetDefaultCurrencyRequest: {
          type: "object",
          required: ["defaultCurrency"],
          properties: {
            defaultCurrency: {
              type: "string",
              description: "ISO 4217 currency code (3 letters)",
              example: "INR",
              minLength: 3,
              maxLength: 3,
            },
          },
        },
        CreateWalletRequest: {
          type: "object",
          required: ["walletName"],
          properties: {
            walletName: { type: "string", example: "Savings Wallet" },
            color: { type: "string", example: "0xff06c167" },
            icon: { type: "string", example: "CustomIcons.wallet" },
            currency: { type: "string", example: "USD" },
            incomeTotal: {
              type: "number",
              example: 52000,
              description:
                "Opening income total for the wallet. Future income transactions are added to this.",
            },
            expenseTotal: {
              type: "number",
              example: 0,
              description:
                "Opening expense total for the wallet. Future expense transactions are added to this.",
            },
            balance: {
              type: "number",
              example: 52000,
              description:
                "Opening wallet balance. If omitted, incomeTotal - expenseTotal is used.",
            },
          },
        },
        UpdateWalletRequest: {
          type: "object",
          properties: {
            walletName: { type: "string", example: "Swiggy wallet" },
            color: { type: "string", example: "0xff06c167" },
            icon: { type: "string", example: "CustomIcons.wallet" },
            currency: { type: "string", example: "USD" },
            balance: {
              type: "number",
              example: 56000,
              description:
                "Desired wallet balance. If changed, a Payment adjustment transaction is created for the difference.",
            },
          },
        },
        WalletOrderData: {
          type: "object",
          properties: {
            walletIds: {
              type: "array",
              items: { type: "string" },
              example: [
                "6820752aebf84d7a6394c164",
                "6820752aebf84d7a6394c165",
                "6820752aebf84d7a6394c166",
              ],
              description:
                "Ordered list of wallet ids. Matches the order used by GET /api/wallets.",
            },
          },
        },
        UpdateWalletOrderRequest: {
          type: "object",
          required: ["walletIds"],
          properties: {
            walletIds: {
              type: "array",
              items: { type: "string" },
              example: [
                "6820752aebf84d7a6394c166",
                "6820752aebf84d7a6394c164",
                "6820752aebf84d7a6394c165",
              ],
              description:
                "Full ordered list of all active wallet ids. Must include every wallet exactly once with no duplicates.",
            },
          },
        },
        CheckoutConfirmRequest: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: {
              type: "string",
              description:
                "Stripe Checkout session id returned after payment. Alternative to GET /api/subscriptions/checkout/success?session_id=...",
              example: "cs_test_a1b2c3",
            },
          },
        },
        CreateCategoryRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Groceries" },
            color: { type: "string", example: "0xff4549ff" },
            icon: { type: "string", example: "CustomIcons.catFood" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
              description: "Defaults to EXPENSE when omitted.",
            },
          },
        },
        CurrencyItem: {
          type: "object",
          properties: {
            code: { type: "string", example: "INR" },
            name: { type: "string", example: "Indian Rupee" },
            symbol: { type: "string", example: "₹" },
            decimalPlaces: { type: "integer", example: 2 },
            sortOrder: { type: "integer", example: 4 },
            rate: {
              type: "number",
              nullable: true,
              example: 83.12,
              description:
                "Latest rate relative to baseCurrency (1 USD = rate INR)",
            },
          },
        },
        CurrencyConversionResponse: {
          type: "object",
          properties: {
            userWalletCurrencies: {
              type: "array",
              items: { type: "string" },
              example: ["INR", "USD", "GBP"],
              description:
                "User default currency first, followed by unique currencies from the user's wallets.",
            },
            conversions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", example: "USD" },
                  to: { type: "string", example: "INR" },
                  rate: { type: "number", example: 96.67 },
                },
              },
              description:
                "Exchange rates for every ordered currency pair (from !== to) in userWalletCurrencies.",
            },
          },
        },
        UpdateCategoryRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Groceries" },
            color: { type: "string", example: "0xff4549ff" },
            icon: { type: "string", example: "CustomIcons.catFood" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
            },
          },
        },
        CreateTransactionRequest: {
          type: "object",
          required: ["walletId", "type", "amount"],
          properties: {
            walletId: { type: "string" },
            categoryId: {
              type: "string",
              nullable: true,
              description:
                "Optional. If omitted, the transaction is created without a category.",
            },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            amount: {
              type: "number",
              example: 100000,
              description:
                "Transaction amount. By default this is in the wallet currency. Use amountIn=to with amountCurrency when entering a foreign currency amount.",
            },
            amountCurrency: {
              type: "string",
              example: "USD",
              description:
                "Required when amountIn=to. The foreign currency the user entered (wallet currency is implied by walletId).",
            },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
              description:
                "from = amount is in wallet currency (default). to = amount is in amountCurrency and will be converted to wallet currency.",
            },
            title: {
              type: "string",
              nullable: true,
              example: "Salary",
              description:
                "Optional. If omitted or empty, the transaction is created without a title.",
            },
            description: { type: "string", nullable: true },
            transactionDate: {
              type: "string",
              format: "date-time",
              description: "Defaults to now if omitted",
            },
          },
        },
        ReceiptUploadPolicy: {
          type: "object",
          description:
            "Receipt uploads are plan-based. Basic (free): not allowed. Premium: allowed up to 300 MB total receipt storage. Premium+: 5 GB total receipt storage. Each receipt file (image or PDF) may be up to 15 MB.",
          properties: {
            maxFileSizeMB: { type: "integer", example: 15 },
            basicPlanAllowed: { type: "boolean", example: false },
            premiumStorageLimitMB: { type: "integer", example: 1024 },
            premiumPlusStorageLimitMB: {
              type: "string",
              example: "unlimited",
            },
          },
        },
        CreateTransactionMultipartRequest: {
          type: "object",
          required: ["walletId", "type", "amount"],
          properties: {
            walletId: { type: "string" },
            categoryId: {
              type: "string",
              nullable: true,
              description:
                "Optional. If omitted, the transaction is created without a category.",
            },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            amount: {
              type: "number",
              example: 100000,
              description:
                "Transaction amount. By default this is in the wallet currency. Use amountIn=to with amountCurrency when entering a foreign currency amount.",
            },
            amountCurrency: {
              type: "string",
              example: "USD",
              description:
                "Required when amountIn=to. The foreign currency the user entered (wallet currency is implied by walletId).",
            },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
              description:
                "from = amount is in wallet currency (default). to = amount is in amountCurrency and will be converted to wallet currency.",
            },
            title: {
              type: "string",
              nullable: true,
              example: "Restaurant bill",
              description:
                "Optional. If omitted or empty, the transaction is created without a title.",
            },
            description: { type: "string", nullable: true },
            transactionDate: {
              type: "string",
              format: "date-time",
              description: "Defaults to now if omitted",
            },
            receipt: {
              type: "string",
              format: "binary",
              description:
                "Receipt image or PDF file, max 15 MB. Requires Premium or Premium+ plan. Premium storage is capped at 300 MB total; Premium+ at 5 GB.",
            },
          },
        },
        UpdateTransactionRequest: {
          type: "object",
          properties: {
            walletId: { type: "string" },
            categoryId: {
              type: "string",
              nullable: true,
              description:
                "Optional. Omit to keep the current category. Pass null or an empty string to clear it.",
            },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            amount: {
              type: "number",
              example: 100000,
              description:
                "Transaction amount. By default this is in the wallet currency. Use amountIn=to with amountCurrency when entering a foreign currency amount.",
            },
            amountCurrency: {
              type: "string",
              example: "USD",
              description:
                "Required when amountIn=to. The foreign currency the user entered (wallet currency is implied by walletId).",
            },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
              description:
                "from = amount is in wallet currency (default). to = amount is in amountCurrency and will be converted to wallet currency.",
            },
            title: {
              type: "string",
              nullable: true,
              example: "Salary",
              description:
                "Optional. Pass null or an empty string to clear the title.",
            },
            description: { type: "string", nullable: true },
            transactionDate: {
              type: "string",
              format: "date-time",
            },
            removeReceipt: {
              type: "boolean",
              description: "Set true to unlink the current receipt",
            },
            updateReferenceTransaction: {
              type: "boolean",
              description:
                "When true and this transaction is part of a wallet transfer, also updates the linked counterpart transaction using the original transfer conversion ratio.",
            },
          },
        },
        UpdateTransactionMultipartRequest: {
          type: "object",
          properties: {
            walletId: { type: "string" },
            categoryId: {
              type: "string",
              nullable: true,
              description:
                "Optional. Omit to keep the current category. Pass null or an empty string to clear it.",
            },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            amount: {
              type: "number",
              example: 100000,
              description:
                "Transaction amount. By default this is in the wallet currency. Use amountIn=to with amountCurrency when entering a foreign currency amount.",
            },
            amountCurrency: {
              type: "string",
              example: "USD",
              description:
                "Required when amountIn=to. The foreign currency the user entered (wallet currency is implied by walletId).",
            },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
              description:
                "from = amount is in wallet currency (default). to = amount is in amountCurrency and will be converted to wallet currency.",
            },
            title: {
              type: "string",
              nullable: true,
              example: "Restaurant bill",
              description:
                "Optional. Pass null or an empty string to clear the title.",
            },
            description: { type: "string", nullable: true },
            transactionDate: {
              type: "string",
              format: "date-time",
            },
            removeReceipt: {
              type: "string",
              example: "false",
              description: "Set true to unlink the current receipt",
            },
            receipt: {
              type: "string",
              format: "binary",
              description:
                "Replacement receipt image or PDF file, max 15 MB. Requires Premium or Premium+ plan. Premium storage is capped at 300 MB total; Premium+ at 5 GB. Replaces the previous receipt and deletes it from storage.",
            },
            updateReferenceTransaction: {
              type: "boolean",
              description:
                "When true and this transaction is part of a wallet transfer, also updates the linked counterpart transaction using the original transfer conversion ratio.",
            },
          },
        },
        CreateTransferRequest: {
          type: "object",
          required: ["fromWalletId", "toWalletId", "amount"],
          properties: {
            fromWalletId: { type: "string" },
            toWalletId: { type: "string" },
            amount: {
              type: "number",
              example: 100000,
              description:
                "Transfer amount. By default this is deducted from the source wallet currency. Use amountIn=to when amount is in the destination wallet currency.",
            },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
              description:
                "Whether amount is expressed in the source wallet currency (from) or destination wallet currency (to).",
            },
            title: { type: "string", example: "Move to savings" },
            description: { type: "string", nullable: true },
            transferDate: { type: "string", format: "date-time" },
          },
        },
        CreateTransferMultipartRequest: {
          type: "object",
          required: ["fromWalletId", "toWalletId", "amount"],
          properties: {
            fromWalletId: { type: "string" },
            toWalletId: { type: "string" },
            amount: { type: "number", example: 100000 },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
            },
            title: { type: "string", example: "Move to savings" },
            description: { type: "string", nullable: true },
            transferDate: { type: "string", format: "date-time" },
            receipt: {
              type: "string",
              format: "binary",
              description:
                "Receipt image or PDF file, max 15 MB. Requires Premium or Premium+ plan. Premium storage is capped at 300 MB total; Premium+ at 5 GB.",
            },
          },
        },
        UpdateTransferRequest: {
          type: "object",
          properties: {
            fromWalletId: { type: "string" },
            toWalletId: { type: "string" },
            amount: { type: "number", example: 75 },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
            },
            title: { type: "string", example: "Move to savings" },
            description: { type: "string", nullable: true },
            transferDate: { type: "string", format: "date-time" },
            removeReceipt: {
              type: "boolean",
              example: false,
              description: "Set true to unlink the current receipt",
            },
          },
        },
        UpdateTransferMultipartRequest: {
          type: "object",
          properties: {
            fromWalletId: { type: "string" },
            toWalletId: { type: "string" },
            amount: { type: "number", example: 75 },
            amountIn: {
              type: "string",
              enum: ["from", "to"],
              example: "from",
            },
            title: { type: "string", example: "Move to savings" },
            description: { type: "string", nullable: true },
            transferDate: { type: "string", format: "date-time" },
            removeReceipt: {
              type: "string",
              example: "false",
              description: "Set true to unlink the current receipt",
            },
            receipt: {
              type: "string",
              format: "binary",
              description:
                "Replacement receipt image or PDF file, max 15 MB. Requires Premium or Premium+ plan. Premium storage is capped at 300 MB total; Premium+ at 5 GB. Replaces the previous receipt and deletes it from storage.",
            },
          },
        },
        CreatePlannedPaymentRequest: {
          type: "object",
          required: ["type", "title", "amount", "plannedType", "startDate"],
          properties: {
            walletId: {
              type: "string",
              description:
                "Optional. Uses user's defaultWalletId when omitted.",
            },
            categoryId: {
              type: "string",
              nullable: true,
              description:
                "Optional. When omitted, the planned payment is created without a category.",
            },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            title: { type: "string", example: "Car service" },
            amount: { type: "number", example: 120 },
            description: { type: "string", nullable: true },
            plannedType: {
              type: "string",
              enum: ["ONE_TIME", "REPEATED"],
              example: "REPEATED",
            },
            startDate: { type: "string", format: "date-time" },
            repeatInterval: {
              type: "integer",
              example: 2,
              description: "Required when plannedType is REPEATED",
            },
            repeatUnit: {
              type: "string",
              enum: ["DAYS", "WEEKS", "MONTHS", "YEARS"],
              example: "WEEKS",
              description: "Required when plannedType is REPEATED",
            },
            repeatUntilTimes: {
              type: "integer",
              example: 5,
              description: "Required when plannedType is REPEATED",
            },
          },
        },
        PlannedPaymentDecisionRequest: {
          type: "object",
          required: ["occurrenceDate", "action"],
          properties: {
            occurrenceDate: {
              type: "string",
              format: "date-time",
              example: "2026-07-23",
              description:
                "Date of the occurrence to accept or decline. Accepts ISO date-time or YYYY-MM-DD.",
            },
            action: { type: "string", enum: ["ACCEPT", "DECLINE"] },
          },
        },
        DeletePlannedPaymentOccurrenceRequest: {
          type: "object",
          required: ["occurrenceDate"],
          properties: {
            occurrenceDate: {
              type: "string",
              format: "date-time",
              example: "2026-07-23",
              description:
                "Date of the single occurrence to remove. Accepts ISO date-time or YYYY-MM-DD.",
            },
          },
        },
        PlannedPaymentOccurrence: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "6a2653846b043ec4ec66e08c:2026-07-23",
              description:
                "Composite id in the form plannedPaymentId:occurrenceKey. Each list row is one scheduled date, not a separate planned payment record.",
            },
            plannedPaymentId: { type: "string" },
            occurrenceKey: {
              type: "string",
              example: "2026-07-23",
            },
            occurrenceNumber: { type: "integer", example: 5 },
            occurrenceDate: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["UPCOMING", "OVERDUE"] },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            title: { type: "string" },
            amount: { type: "number" },
            description: { type: "string", nullable: true },
            plannedType: { type: "string", enum: ["ONE_TIME", "REPEATED"] },
            startDate: { type: "string", format: "date-time" },
            repeatInterval: { type: "integer", nullable: true },
            repeatUnit: {
              type: "string",
              enum: ["DAYS", "WEEKS", "MONTHS", "YEARS"],
              nullable: true,
            },
            repeatUntilTimes: { type: "integer", nullable: true },
            walletId: { type: "object" },
            categoryId: { type: "object", nullable: true },
          },
        },
        CreateVoiceTransactionDraftRequest: {
          type: "object",
          required: ["transcript"],
          properties: {
            transcript: {
              type: "string",
              example: "I spent 40 dollars for food last Monday",
            },
            referenceDate: {
              type: "string",
              format: "date-time",
              description:
                "Frontend capture time used to resolve relative spoken dates. Defaults to backend now.",
            },
            timezone: {
              type: "string",
              example: "Asia/Kolkata",
              description:
                "Timezone for relative spoken dates when the frontend knows it.",
            },
          },
        },
        CreateReportRequest: {
          type: "object",
          required: ["fromDate", "toDate", "reportType"],
          properties: {
            walletIds: {
              type: "array",
              items: { type: "string" },
              description: "Empty = all wallets",
            },
            fromDate: { type: "string", format: "date-time" },
            toDate: { type: "string", format: "date-time" },
            reportType: {
              type: "string",
              enum: ["CSV", "PDF", "RECEIPTS_CSV"],
              example: "CSV",
            },
            filters: {
              type: "object",
              additionalProperties: true,
              properties: {
                transactionType: {
                  type: "string",
                  enum: ["income", "expense", "INCOME", "EXPENSE"],
                  description: "Filters transactions by type. Alias: type.",
                },
                categoryId: { type: "string" },
              },
              example: { transactionType: "income" },
            },
          },
        },
        SubscriptionCheckoutRequest: {
          type: "object",
          required: ["planId"],
          properties: {
            planId: {
              type: "string",
              description: "Premium or Premium+ plan id",
            },
          },
        },
        HelpCenterRequest: {
          type: "object",
          required: ["subject", "message", "userId"],
          properties: {
            subject: { type: "string", example: "Unable to export report" },
            message: {
              type: "string",
              example:
                "I am getting an error when exporting my monthly report.",
            },
            userId: {
              type: "string",
              description: "Must match the authenticated user's id.",
            },
          },
        },
        ReportBugRequest: {
          type: "object",
          required: ["subject", "msg"],
          properties: {
            subject: {
              type: "string",
              example: "App crashes on wallet screen",
            },
            msg: {
              type: "string",
              example: "The app closes whenever I open wallet details.",
            },
          },
        },
        ReportBugMultipartRequest: {
          type: "object",
          required: ["subject", "msg"],
          properties: {
            subject: {
              type: "string",
              example: "App crashes on wallet screen",
            },
            msg: {
              type: "string",
              example: "The app closes whenever I open wallet details.",
            },
            attachment: {
              type: "string",
              format: "binary",
              description: "Optional screenshot image, max 3 MB",
            },
          },
        },
        FeatureRequestRequest: {
          type: "object",
          required: ["msg"],
          properties: {
            msg: {
              type: "string",
              example: "Please add recurring expense reminders.",
            },
          },
        },
        FeatureRequestMultipartRequest: {
          type: "object",
          required: ["msg"],
          properties: {
            msg: {
              type: "string",
              example: "Please add recurring expense reminders.",
            },
            attachment: {
              type: "string",
              format: "binary",
              description: "Optional mockup image, max 3 MB",
            },
          },
        },
        ChangeSubscriptionPlanRequest: {
          type: "object",
          required: ["planId"],
          properties: {
            planId: {
              type: "string",
              description:
                "Target paid plan id. Upgrades apply immediately with proration. Downgrades apply from the next billing period.",
            },
          },
        },
        AdminLoginRequest: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string", example: "admin" },
            password: { type: "string", example: "your_secure_admin_password" },
          },
        },
        AdminProfile: {
          type: "object",
          properties: {
            id: { type: "string", example: "6820752aebf84d7a6394c164" },
            username: { type: "string", example: "admin" },
            name: { type: "string", example: "Admin" },
            lastLoginAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2026-06-23T10:30:00.000Z",
            },
          },
        },
        AdminLoginData: {
          type: "object",
          properties: {
            accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIs...",
            },
            admin: { $ref: "#/components/schemas/AdminProfile" },
          },
        },
        AdminLogoutRequest: {
          type: "object",
          properties: {
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJI...",
              description:
                "Optional. When provided, the matching admin session is deleted.",
            },
          },
        },
        AdminOnboardingWallet: {
          type: "object",
          properties: {
            _id: { type: "string", example: "6820752aebf84d7a6394c164" },
            name: { type: "string", example: "Cash" },
            icon: { type: "string", example: "💵" },
            color: { type: "string", example: "0xff5cb109" },
            currency: { type: "string", example: "USD" },
          },
        },
        AdminOnboardingCategory: {
          type: "object",
          properties: {
            _id: { type: "string", example: "6820752aebf84d7a6394c16a" },
            name: { type: "string", example: "Food & Dining" },
            icon: { type: "string", example: "🍔" },
            color: { type: "string", example: "0xffff9518" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
            },
          },
        },
        CreateAdminOnboardingWalletRequest: {
          type: "object",
          required: ["name", "icon", "color", "currency"],
          properties: {
            name: { type: "string", example: "Cash" },
            icon: { type: "string", example: "💵" },
            color: { type: "string", example: "0xff5cb109" },
            currency: { type: "string", example: "USD" },
          },
        },
        UpdateAdminOnboardingWalletRequest: {
          type: "object",
          required: ["name", "icon", "color", "currency"],
          properties: {
            name: { type: "string", example: "Main Bank Account" },
            icon: { type: "string", example: "🏦" },
            color: { type: "string", example: "0xff4549ff" },
            currency: { type: "string", example: "USD" },
          },
        },
        CreateAdminOnboardingCategoryRequest: {
          type: "object",
          required: ["name", "icon", "color", "type"],
          properties: {
            name: { type: "string", example: "Food & Dining" },
            icon: { type: "string", example: "🍔" },
            color: { type: "string", example: "0xffff9518" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
            },
          },
        },
        UpdateAdminOnboardingCategoryRequest: {
          type: "object",
          required: ["name", "icon", "color", "type"],
          properties: {
            name: { type: "string", example: "Transport" },
            icon: { type: "string", example: "🚗" },
            color: { type: "string", example: "0xff4549ff" },
            type: {
              type: "string",
              enum: ["INCOME", "EXPENSE"],
              example: "EXPENSE",
            },
          },
        },
        PlanFeature: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", example: "Unlimited Wallets" },
            icon: { type: "string", example: "wallet", default: "" },
            description: {
              type: "string",
              example: "Create as many wallets as you need.",
              default: "",
            },
          },
        },
        AdminPlan: {
          type: "object",
          properties: {
            id: { type: "string", example: "6820752aebf84d7a6394c170" },
            name: { type: "string", example: "Premium" },
            price: { type: "number", example: 3 },
            currency: { type: "string", example: "AUD" },
            billingType: {
              type: "string",
              enum: ["MONTHLY", "YEARLY", "LIFETIME"],
              example: "MONTHLY",
            },
            maxWallets: {
              type: "number",
              example: 999999,
              description: "Use 999999 for unlimited wallets.",
            },
            adsEnabled: { type: "boolean", example: false },
            monthlyReportLimit: {
              type: "number",
              example: 5,
              description: "Use 999999 for unlimited monthly reports.",
            },
            cloudStorageLimitMB: { type: "number", example: 300 },
            stripeProductId: {
              type: "string",
              nullable: true,
              example: "prod_xxx",
            },
            stripePriceId: {
              type: "string",
              nullable: true,
              example: "price_xxx",
            },
            features: {
              type: "array",
              items: { $ref: "#/components/schemas/PlanFeature" },
            },
            isActive: { type: "boolean", example: true },
            createdAt: {
              type: "string",
              format: "date-time",
              example: "2026-01-15T10:00:00.000Z",
            },
          },
        },
        UpdateAdminPlanRequest: {
          type: "object",
          required: ["features"],
          properties: {
            features: {
              type: "array",
              items: { $ref: "#/components/schemas/PlanFeature" },
            },
          },
        },
        AdminCurrency: {
          type: "object",
          properties: {
            id: { type: "string", example: "6820752aebf84d7a6394c171" },
            code: { type: "string", example: "USD" },
            name: { type: "string", example: "US Dollar" },
            symbol: { type: "string", example: "$" },
            decimalPlaces: { type: "integer", example: 2 },
            sortOrder: { type: "integer", example: 1 },
            isActive: { type: "boolean", example: true },
          },
        },
        CreateAdminCurrencyRequest: {
          type: "object",
          required: ["code", "name"],
          properties: {
            code: {
              type: "string",
              minLength: 3,
              maxLength: 3,
              example: "USD",
            },
            name: { type: "string", example: "US Dollar" },
            symbol: { type: "string", example: "$", default: "" },
            decimalPlaces: {
              type: "integer",
              minimum: 0,
              maximum: 4,
              example: 2,
              default: 2,
            },
            sortOrder: {
              type: "integer",
              example: 1,
              description:
                "Optional. Auto-assigned to max sortOrder + 1 when omitted.",
            },
            isActive: { type: "boolean", example: true, default: true },
          },
        },
        UpdateAdminCurrencyRequest: {
          type: "object",
          required: ["name"],
          properties: {
            code: {
              type: "string",
              minLength: 3,
              maxLength: 3,
              example: "USD",
            },
            name: { type: "string", example: "US Dollar" },
            symbol: { type: "string", example: "$" },
            decimalPlaces: {
              type: "integer",
              minimum: 0,
              maximum: 4,
              example: 2,
            },
            sortOrder: { type: "integer", example: 1 },
            isActive: { type: "boolean", example: true },
          },
        },
      },
    },
    paths: {
      "/api/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Signup user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignupRequest" },
              },
            },
          },
          responses: {
            201: { description: "Signup successful" },
            400: { description: "Validation failed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: {
            200: { description: "Login successful with tokens" },
            400: { description: "Invalid credentials" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/google": {
        post: {
          tags: ["Auth"],
          summary: "Sign in with Google",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SocialAuthRequest" },
              },
            },
          },
          responses: {
            200: { description: "Google login successful with tokens" },
            400: { description: "Invalid token or configuration" },
            403: { description: "User is not active" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/apple": {
        post: {
          tags: ["Auth"],
          summary: "Sign in with Apple",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SocialAuthRequest" },
              },
            },
          },
          responses: {
            200: { description: "Apple login successful with tokens" },
            400: {
              description: "Invalid token, missing email, or configuration",
            },
            403: { description: "User is not active" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/verify-otp": {
        post: {
          tags: ["Auth"],
          summary: "Verify OTP",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifyOtpRequest" },
              },
            },
          },
          responses: {
            200: { description: "OTP verified" },
            400: { description: "Invalid or expired OTP" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Send forgot password OTP",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
              },
            },
          },
          responses: {
            200: { description: "OTP sent" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Reset password after OTP verification",
          description:
            "Does not require an access token. Call forgot-password, verify the OTP, then reset the password with the same email.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
              },
            },
          },
          responses: {
            200: { description: "Password reset" },
            400: { description: "Validation failed" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/refresh-token": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
              },
            },
          },
          responses: {
            200: { description: "Token refreshed" },
            401: { description: "Invalid refresh token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout user",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogoutRequest" },
              },
            },
          },
          responses: {
            200: { description: "Logout successful" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/login": {
        post: {
          tags: ["Admin"],
          summary: "Admin login",
          description:
            "Authenticate an admin user for the React admin panel. A default admin is created on server start when ADMIN_USERNAME and ADMIN_PASSWORD are set in .env and no matching admin exists yet.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminLoginRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Login successful with admin tokens",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/AdminLoginData" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Username and password are required" },
            401: { description: "Invalid username or password" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/me": {
        get: {
          tags: ["Admin"],
          summary: "Get current admin profile",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: {
              description: "Admin profile fetched",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              admin: {
                                $ref: "#/components/schemas/AdminProfile",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Admin not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/refresh-token": {
        post: {
          tags: ["Admin"],
          summary: "Refresh admin access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Token refreshed",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              accessToken: {
                                type: "string",
                                example: "eyJhbGciOiJIUzI1NiIs...",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Refresh token is required" },
            401: { description: "Invalid refresh token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/logout": {
        post: {
          tags: ["Admin"],
          summary: "Admin logout",
          security: [{ adminBearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminLogoutRequest" },
              },
            },
          },
          responses: {
            200: { description: "Logout successful" },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/onboarding/wallets": {
        get: {
          tags: ["Admin"],
          summary: "List onboarding wallet templates",
          description:
            "Returns default wallet templates shown during mobile onboarding and managed in the admin panel.",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: { description: "Onboarding wallets fetched" },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Create onboarding wallet template",
          security: [{ adminBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateAdminOnboardingWalletRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Onboarding wallet created" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/onboarding/wallets/{id}": {
        put: {
          tags: ["Admin"],
          summary: "Update onboarding wallet template",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateAdminOnboardingWalletRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Onboarding wallet updated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Onboarding wallet not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Admin"],
          summary: "Delete onboarding wallet template",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Onboarding wallet deleted" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Onboarding wallet not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/onboarding/categories": {
        get: {
          tags: ["Admin"],
          summary: "List onboarding category templates",
          description:
            "Returns default category templates shown during mobile onboarding and managed in the admin panel.",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: { description: "Onboarding categories fetched" },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Create onboarding category template",
          security: [{ adminBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateAdminOnboardingCategoryRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Onboarding category created" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/onboarding/categories/{id}": {
        put: {
          tags: ["Admin"],
          summary: "Update onboarding category template",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateAdminOnboardingCategoryRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Onboarding category updated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Onboarding category not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Admin"],
          summary: "Delete onboarding category template",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Onboarding category deleted" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Onboarding category not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/plans": {
        get: {
          tags: ["Admin"],
          summary: "List active subscription plans",
          description:
            "Returns active subscription plans managed in the admin panel. Plans are seeded on server start; only updates are allowed via PUT /api/admin/plans/{id}.",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: {
              description: "Plans fetched",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              plans: {
                                type: "array",
                                items: {
                                  $ref: "#/components/schemas/AdminPlan",
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/plans/{id}": {
        put: {
          tags: ["Admin"],
          summary: "Update subscription plan features",
          description:
            "Updates only the plan feature list. Pricing, limits, billing type, and Stripe IDs cannot be changed via the admin API.",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateAdminPlanRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Plan features updated",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/AdminPlan" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Plan not found" },
            409: { description: "A plan with this name already exists" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/currencies": {
        get: {
          tags: ["Admin"],
          summary: "List active supported currencies",
          description:
            "Returns active currencies managed in the admin panel. Currencies are seeded on server start; admin changes via this API are reflected in GET /api/currencies.",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: {
              description: "Currencies fetched",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              currencies: {
                                type: "array",
                                items: {
                                  $ref: "#/components/schemas/AdminCurrency",
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized or invalid admin token" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Create supported currency",
          description: "Creates a new currency.",
          security: [{ adminBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateAdminCurrencyRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Currency created",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/AdminCurrency" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            409: { description: "A currency with this code already exists" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/currencies/{id}": {
        put: {
          tags: ["Admin"],
          summary: "Update supported currency",
          description:
            "Updates currency metadata, including the ISO 4217 code when changed.",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateAdminCurrencyRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Currency updated",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/AdminCurrency" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Currency not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Admin"],
          summary: "Deactivate supported currency",
          description:
            "Soft-deletes a currency by setting isActive to false. Wallets already using this currency are not affected.",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Currency deleted" },
            400: { description: "Invalid currency id" },
            401: { description: "Unauthorized or invalid admin token" },
            404: { description: "Currency not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/admin/legal-documents": {
        get: {
          tags: ["Admin"],
          summary: "List legal documents",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: { description: "Legal documents fetched" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/legal-documents/{type}": {
        put: {
          tags: ["Admin"],
          summary: "Update legal document HTML content",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "type",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"],
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["contentHtml"],
                  properties: {
                    contentHtml: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Legal document updated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "List users with filters",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: { description: "Users fetched" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/users/{id}": {
        get: {
          tags: ["Admin"],
          summary: "Get user details",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "User fetched" },
            404: { description: "User not found" },
          },
        },
      },
      "/api/admin/users/{id}/status": {
        patch: {
          tags: ["Admin"],
          summary: "Activate or deactivate user",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: {
                      type: "string",
                      enum: ["ACTIVE", "DEACTIVATED"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "User status updated" },
            400: { description: "Validation failed" },
            404: { description: "User not found" },
          },
        },
      },
      "/api/admin/support-submissions": {
        get: {
          tags: ["Admin"],
          summary: "List support submissions",
          security: [{ adminBearerAuth: [] }],
          responses: {
            200: { description: "Support submissions fetched" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/support-submissions/{id}": {
        get: {
          tags: ["Admin"],
          summary: "Get support submission details",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Support submission fetched" },
            404: { description: "Not found" },
          },
        },
        patch: {
          tags: ["Admin"],
          summary: "Update support submission status",
          security: [{ adminBearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["OPEN", "CLOSED"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Support submission updated" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/legal/{type}": {
        get: {
          tags: ["App Settings"],
          summary: "Get public legal document HTML",
          parameters: [
            {
              name: "type",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"],
              },
            },
          ],
          responses: {
            200: { description: "Legal document fetched" },
            400: { description: "Invalid type" },
          },
        },
      },
      "/api/auth/onboarding-options": {
        get: {
          tags: ["Onboarding"],
          summary: "Get onboarding wallet/category options",
          description:
            "Reads default wallet and category templates from the database. Admin changes via /api/admin/onboarding/* are reflected here immediately.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Options fetched",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: {
                        type: "string",
                        example: "Onboarding options fetched successfully",
                      },
                      data: {
                        type: "object",
                        properties: {
                          wallets: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/OnboardingWalletOption",
                            },
                          },
                          categories: {
                            $ref: "#/components/schemas/OnboardingCategoriesByType",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/complete-onboarding": {
        post: {
          tags: ["Onboarding"],
          summary: "Save selected onboarding options",
          description:
            "Completes onboarding by copying selected wallet/category templates and/or creating custom wallets and categories in request order. Custom wallet and category objects use the same fields as POST /api/wallets and POST /api/categories.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CompleteOnboardingRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Onboarding completed" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding has already been completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/users/me": {
        get: {
          tags: ["Users"],
          summary: "Get current user (with plan summary and warnings)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description:
                "User profile, plan, and warnings (e.g. receipt deletion after downgrade/cancel)",
            },
            401: { description: "Unauthorized" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
        patch: {
          tags: ["Users"],
          summary: "Update current user profile (multipart for profile photo)",
          description:
            "Send **multipart/form-data** with field `profileImage` (file) to upload to Cloudflare R2. Text fields can be sent as form fields in the same request.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/UpdateUserMultipartRequest",
                },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateUserRequest" },
              },
            },
          },
          responses: {
            200: { description: "Profile updated; profileImage is an R2 URL" },
            400: { description: "Validation failed or invalid image" },
            401: { description: "Unauthorized" },
            503: { description: "Cloudflare R2 not configured" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Delete current user account",
          description:
            "Soft-deletes the user account, invalidates active sessions, anonymizes unique identity fields, and removes user-owned transient data.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Account deleted" },
            401: { description: "Unauthorized" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/users/me/default-currency": {
        post: {
          tags: ["Users"],
          summary: "Set default currency",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SetDefaultCurrencyRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Default currency updated" },
            400: { description: "Invalid currency" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/users/me/default-wallet": {
        post: {
          tags: ["Users"],
          summary: "Set default wallet (must be in selectedWallets)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SetDefaultWalletRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Default wallet updated" },
            400: { description: "Invalid wallet" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/wallets": {
        get: {
          tags: ["Wallets"],
          summary: "List wallets with balances",
          description:
            "Returns wallets in the user's saved wallet order. When no custom order is set, wallets are sorted A-Z by walletName. Any wallets missing from the saved order are appended at the end, also sorted A-Z by name.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "List of wallets in user-defined order" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Wallets"],
          summary: "Create wallet",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateWalletRequest" },
              },
            },
          },
          responses: {
            201: { description: "Wallet created" },
            401: { description: "Unauthorized" },
            403: { description: "Limit reached or onboarding incomplete" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/wallets/order": {
        get: {
          tags: ["Wallets"],
          summary: "Get wallet order",
          description:
            "Returns the effective wallet order for the current user. If no custom order has been saved, wallets are returned in default A-Z order by walletName.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Wallet order fetched successfully",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            $ref: "#/components/schemas/WalletOrderData",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        patch: {
          tags: ["Wallets"],
          summary: "Update wallet order",
          description:
            "Saves a user-defined wallet order. walletIds must include every active wallet exactly once. After saving, GET /api/wallets returns wallets in this order.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateWalletOrderRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Wallet order updated successfully",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            $ref: "#/components/schemas/WalletOrderData",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: {
              description:
                "Invalid walletIds array, duplicates, missing wallets, or invalid wallet id",
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/wallets/{id}": {
        get: {
          tags: ["Wallets"],
          summary: "Get wallet by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Wallet details" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Wallets"],
          summary: "Delete wallet",
          description:
            "Hard-deletes the wallet, its transactions, and planned payments. Transfer records are kept; counterpart transfer transactions remain with unknown wallet.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Wallet deleted" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
        patch: {
          tags: ["Wallets"],
          summary: "Update wallet",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateWalletRequest" },
              },
            },
          },
          responses: {
            200: { description: "Wallet updated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Wallet not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/categories": {
        get: {
          tags: ["Categories"],
          summary: "List user categories",
          description:
            "Returns all categories by default. Pass type=INCOME or type=EXPENSE to filter by transaction type.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "type",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["INCOME", "EXPENSE"] },
              description: "Optional filter for income or expense categories",
            },
          ],
          responses: {
            200: { description: "Categories" },
            400: { description: "Invalid type" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Categories"],
          summary: "Create category",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateCategoryRequest" },
              },
            },
          },
          responses: {
            201: { description: "Category created" },
            400: { description: "Validation / duplicate" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/categories/{id}": {
        patch: {
          tags: ["Categories"],
          summary: "Update category",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateCategoryRequest" },
              },
            },
          },
          responses: {
            200: { description: "Category updated" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Categories"],
          summary: "Delete category",
          description:
            "Hard-deletes the category. Existing transactions keep their records but return unknown category in transaction APIs.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Category deleted" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/transactions": {
        get: {
          tags: ["Transactions"],
          summary: "List transactions (paginated, filterable)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
            {
              name: "walletId",
              in: "query",
              schema: { type: "string" },
            },
            {
              name: "type",
              in: "query",
              schema: { type: "string", enum: ["INCOME", "EXPENSE"] },
            },
            {
              name: "categoryId",
              in: "query",
              schema: { type: "string" },
            },
            {
              name: "fromDate",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "toDate",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            200: { description: "Transactions and pagination" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Transactions"],
          summary: "Create transaction, optionally with receipt",
          description:
            "Receipt upload is disabled on the free (Basic) plan. Premium users may upload receipts up to 300 MB total storage. Premium+ users may upload up to 5 GB. Each receipt file may be up to 15 MB.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/CreateTransactionMultipartRequest",
                },
              },
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateTransactionRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Transaction created" },
            400: { description: "Validation failed or receipt exceeds 15 MB" },
            401: { description: "Unauthorized" },
            403: {
              description:
                "Onboarding not completed, receipt upload not allowed on free plan, or Premium storage limit reached",
            },
            404: { description: "Wallet or category not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/transactions/{id}": {
        get: {
          tags: ["Transactions"],
          summary: "Get transaction by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Transaction" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
        patch: {
          tags: ["Transactions"],
          summary: "Update transaction, optionally replacing receipt",
          description:
            "Receipt upload follows the same plan rules as transaction create. Replacing a receipt frees the previous file size from your storage quota before counting the new upload.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/UpdateTransactionMultipartRequest",
                },
              },
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UpdateTransactionRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Transaction updated" },
            400: {
              description:
                "Validation failed, insufficient balance, or receipt exceeds 15 MB",
            },
            401: { description: "Unauthorized" },
            403: {
              description:
                "Onboarding not completed, receipt upload not allowed on free plan, or Premium storage limit reached",
            },
            404: { description: "Transaction, wallet, or category not found" },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Transactions"],
          summary: "Soft-delete transaction",
          description:
            "Soft-deletes the transaction. When deleteReferenceTransaction is true and the transaction belongs to a wallet transfer, the linked counterpart transaction is also soft-deleted, the transfer record is removed, and wallet balances are recalculated from remaining active transactions only.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "deleteReferenceTransaction",
              in: "query",
              required: false,
              schema: { type: "boolean" },
              description:
                "When true and this transaction is part of a wallet transfer, also soft-deletes the linked counterpart transaction.",
            },
          ],
          responses: {
            200: {
              description:
                "Transaction deleted. Returns affectedWallets with balances recalculated from active transactions only (deleted transactions are excluded and must not be adjusted again on the client).",
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments": {
        get: {
          tags: ["Planned Payments"],
          summary: "List active planned payments",
          description:
            "Returns active planned payment rules added by the user (one row per rule, not expanded recurring occurrences). When days is provided, also returns upcoming undecided occurrences within that window.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "days",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0 },
              description:
                "Optional. When set, includes upcoming occurrence entries due after today through today + days (today itself is excluded).",
            },
          ],
          responses: {
            200: { description: "Planned payments list with count" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Planned Payments"],
          summary: "Create planned payment",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreatePlannedPaymentRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Planned payment created" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Wallet or category not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/upcoming": {
        get: {
          tags: ["Planned Payments"],
          summary: "List upcoming planned payment occurrences",
          description:
            "Shortcut for GET /api/planned-payments/occurrences with type=UPCOMING. Requires the same query parameters as the occurrences endpoint.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "days",
              in: "query",
              required: true,
              schema: { type: "integer", minimum: 0 },
            },
          ],
          responses: {
            200: { description: "Upcoming planned payment occurrences" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/{id}": {
        patch: {
          tags: ["Planned Payments"],
          summary: "Update planned payment",
          description:
            "Updates an active planned payment. Accepts the same fields as create. If startDate, plannedType, or repeat settings change, existing accepted/declined occurrence decisions are cleared because the schedule changes.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Planned payment id (plannedPaymentId).",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreatePlannedPaymentRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Planned payment updated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: {
              description: "Planned payment, wallet, or category not found",
            },
            500: { description: "Server error" },
          },
        },
        delete: {
          tags: ["Planned Payments"],
          summary: "Delete entire planned payment series",
          description:
            "Soft-deletes the planned payment rule and cancels all of its occurrences. For repeated payments, this removes every scheduled date in the series. To remove only one occurrence, use DELETE /api/planned-payments/{id}/occurrences instead. Request body is ignored.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description:
                "Planned payment id (plannedPaymentId), not the composite occurrence id.",
            },
          ],
          responses: {
            200: { description: "Planned payment deleted" },
            400: { description: "Invalid planned payment id" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Planned payment not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/occurrences": {
        get: {
          tags: ["Planned Payments"],
          summary: "Fetch upcoming and overdue planned payment occurrences",
          description:
            "Returns undecided occurrences due after today through today + days (today itself is excluded from upcoming). For ALL/OVERDUE, overdue past occurrences are also included. Repeated planned payments expand into multiple rows that share the same plannedPaymentId. Each row has a composite _id of plannedPaymentId:occurrenceKey.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "days",
              in: "query",
              required: true,
              schema: { type: "integer", minimum: 0 },
            },
            {
              name: "type",
              in: "query",
              schema: {
                type: "string",
                enum: ["ALL", "UPCOMING", "OVERDUE"],
                default: "ALL",
              },
            },
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1, minimum: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                default: 20,
                minimum: 1,
                maximum: 100,
              },
            },
          ],
          responses: {
            200: {
              description: "Planned payment occurrences",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "object",
                        properties: {
                          items: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/PlannedPaymentOccurrence",
                            },
                          },
                          pagination: {
                            type: "object",
                            properties: {
                              page: { type: "integer" },
                              limit: { type: "integer" },
                              total: { type: "integer" },
                              totalPages: { type: "integer" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/occurrences/decisions": {
        get: {
          tags: ["Planned Payments"],
          summary: "Fetch accepted and declined planned payment occurrences",
          description:
            "Returns planned payment occurrences that the user has already accepted or declined. Accepted occurrences include the created transaction.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["ALL", "ACCEPTED", "DECLINED"],
                default: "ALL",
              },
            },
            {
              name: "plannedPaymentId",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Planned payment decisions" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/{id}/occurrences/decision": {
        post: {
          tags: ["Planned Payments"],
          summary: "Accept or decline one planned payment occurrence",
          description:
            "ACCEPT creates an income/expense transaction. DECLINE records the occurrence as declined so it no longer appears in upcoming/overdue lists. Use plannedPaymentId in the path, not the composite occurrence _id from the list response.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Planned payment id (plannedPaymentId).",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlannedPaymentDecisionRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Occurrence accepted or declined" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: {
              description: "Planned payment, wallet, or category not found",
            },
            500: { description: "Server error" },
          },
        },
      },
      "/api/planned-payments/{id}/occurrences": {
        delete: {
          tags: ["Planned Payments"],
          summary: "Delete one planned payment occurrence",
          description:
            "Removes a single scheduled occurrence by recording it as declined. Other occurrences in a repeated series remain active. Equivalent to POST /api/planned-payments/{id}/occurrences/decision with action DECLINE.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description:
                "Planned payment id (plannedPaymentId), not the composite occurrence id.",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeletePlannedPaymentOccurrenceRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Planned payment occurrence deleted" },
            400: {
              description: "Validation failed or occurrence already decided",
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Planned payment not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/transfers": {
        get: {
          tags: ["Transfers"],
          summary: "List wallet transfers",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: { description: "Transfers list" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Transfers"],
          summary: "Create wallet-to-wallet transfer, optionally with receipt",
          description:
            "Receipt upload is disabled on the free (Basic) plan. Premium users may upload receipts up to 300 MB total storage. Premium+ users may upload up to 5 GB. Each receipt file may be up to 15 MB.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/CreateTransferMultipartRequest",
                },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateTransferRequest" },
              },
            },
          },
          responses: {
            201: { description: "Transfer completed" },
            400: { description: "Validation failed or receipt exceeds 15 MB" },
            401: { description: "Unauthorized" },
            403: {
              description:
                "Onboarding not completed, receipt upload not allowed on free plan, or Premium storage limit reached",
            },
            404: { description: "Wallet not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/transfers/{id}": {
        patch: {
          tags: ["Transfers"],
          summary: "Update wallet-to-wallet transfer",
          description:
            "Updates the transfer and its linked debit and credit wallet transactions. Receipt upload follows the same plan rules as transfer create.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/UpdateTransferMultipartRequest",
                },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateTransferRequest" },
              },
            },
          },
          responses: {
            200: { description: "Transfer updated" },
            400: { description: "Validation failed or receipt exceeds 15 MB" },
            401: { description: "Unauthorized" },
            403: {
              description:
                "Onboarding not completed, receipt upload not allowed on free plan, or Premium storage limit reached",
            },
            404: {
              description: "Transfer, wallet, or linked transaction not found",
            },
            500: { description: "Server error" },
          },
        },
      },
      "/api/voice/transaction-draft": {
        post: {
          tags: ["Voice"],
          summary:
            "Generate an AI transaction or transfer draft from transcript text",
          description:
            "Returns a confirmation draft only. The frontend should let the user confirm or edit it, then call the existing transaction or transfer create API.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateVoiceTransactionDraftRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Voice draft generated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            503: {
              description: "Local or self-hosted voice model unavailable",
            },
            500: { description: "Server error" },
          },
        },
      },
      "/api/reports": {
        get: {
          tags: ["Reports"],
          summary: "List generated reports",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: { description: "Reports list" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed or limit reached" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Reports"],
          summary: "Generate CSV, PDF, or receipt-only CSV report",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateReportRequest" },
              },
            },
          },
          responses: {
            201: {
              description:
                "Report created; data.reportData contains the report rows as JSON",
            },
            400: { description: "Invalid body" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding or monthly limit" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/reports/{id}/download": {
        get: {
          tags: ["Reports"],
          summary:
            "Get report data (JSON for new reports; legacy file redirect)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            302: { description: "Legacy redirect to stored file URL" },
            200: {
              description:
                "Report JSON (new reports) or legacy local file stream",
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Report or file not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/subscriptions": {
        get: {
          tags: ["Subscriptions"],
          summary: "Get plans and current subscription",
          description:
            "Returns active subscription plans with price, billingType, features, Stripe price/product ids, selected flag, the user's effective plan, and pending downgrade/cancellation plan. Plans are seeded on server start when empty; admin changes via /api/admin/plans/* are reflected here immediately.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description:
                "plans[], plan, subscription, pendingPlan, walletCount, walletLimit, billingProvider",
            },
            401: { description: "Unauthorized" },
            500: { description: "Server error" },
          },
        },
      },
      "/subscription/success": {
        get: {
          tags: ["Subscriptions"],
          summary: "Stripe checkout success redirect",
          description:
            "Browser redirect target after Stripe Checkout completes. Verifies the session_id, activates the subscription, and returns an HTML success page. Append format=json for a JSON response.",
          parameters: [
            {
              name: "session_id",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json"] },
            },
          ],
          responses: {
            200: { description: "Subscription activated" },
            400: { description: "Missing or incomplete checkout session" },
            500: { description: "Activation failed" },
          },
        },
      },
      "/subscription/cancel": {
        get: {
          tags: ["Subscriptions"],
          summary: "Stripe checkout cancel redirect",
          description:
            "Browser redirect target when the user cancels Stripe Checkout. Returns an HTML page or JSON when format=json is provided.",
          parameters: [
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json"] },
            },
          ],
          responses: {
            200: { description: "Checkout cancelled page" },
          },
        },
      },
      "/api/subscriptions/checkout": {
        post: {
          tags: ["Subscriptions"],
          summary: "Start Stripe checkout for a paid plan",
          description:
            "Creates a Stripe Checkout session for recurring monthly billing. Use this when upgrading from the free Basic plan to Premium or Premium+. After payment, Stripe redirects the browser to /subscription/success?session_id=...",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SubscriptionCheckoutRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Stripe checkout session created" },
            400: {
              description:
                "Validation failed or active paid subscription already exists",
            },
            401: { description: "Unauthorized" },
            403: { description: "Too many wallets for target plan" },
            404: { description: "Plan not found" },
            503: { description: "Stripe is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/subscriptions/checkout/success": {
        get: {
          tags: ["Subscriptions"],
          summary: "Confirm checkout session after Stripe redirect",
          description:
            "Authenticated API alternative to the browser success page. Pass the session_id returned by Stripe after checkout.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "session_id",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Subscription activated" },
            400: { description: "Missing or incomplete checkout session" },
            401: { description: "Unauthorized" },
            403: {
              description: "Checkout session does not belong to this user",
            },
            500: { description: "Activation failed" },
          },
        },
      },
      "/api/subscriptions/checkout/confirm": {
        post: {
          tags: ["Subscriptions"],
          summary: "Confirm checkout session (JSON body)",
          description:
            "Authenticated API alternative to GET /api/subscriptions/checkout/success. Pass the Stripe session id in the request body.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutConfirmRequest" },
              },
            },
          },
          responses: {
            200: { description: "Subscription activated" },
            400: { description: "Missing or incomplete checkout session" },
            401: { description: "Unauthorized" },
            403: {
              description: "Checkout session does not belong to this user",
            },
            500: { description: "Activation failed" },
          },
        },
      },
      "/api/subscriptions/change-plan": {
        post: {
          tags: ["Subscriptions"],
          summary: "Upgrade or downgrade an active Stripe subscription",
          description:
            "Upgrades apply immediately and may charge a prorated amount. Downgrades are scheduled for the next billing period and reduce recurring cost from the next month.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ChangeSubscriptionPlanRequest",
                },
              },
            },
          },
          responses: {
            200: { description: "Subscription plan change processed" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Too many wallets for target plan" },
            404: { description: "Subscription or plan not found" },
            503: { description: "Stripe is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/subscriptions/cancel": {
        post: {
          tags: ["Subscriptions"],
          summary: "Cancel paid subscription at period end",
          description:
            "Stops recurring Stripe charges from the next billing period. The user keeps the current paid plan until currentPeriodEnd, then moves back to Basic.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Cancellation scheduled" },
            401: { description: "Unauthorized" },
            403: { description: "Too many wallets for the free plan" },
            404: { description: "Active Stripe subscription not found" },
            503: { description: "Stripe is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/subscriptions/reactivate": {
        post: {
          tags: ["Subscriptions"],
          summary: "Undo a scheduled subscription cancellation",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Subscription reactivated" },
            400: {
              description: "Subscription is not scheduled for cancellation",
            },
            401: { description: "Unauthorized" },
            404: { description: "Stripe subscription not found" },
            503: { description: "Stripe is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/webhooks/stripe": {
        post: {
          tags: ["Subscriptions"],
          summary: "Stripe webhook endpoint",
          description:
            "Receives Stripe events such as checkout.session.completed, customer.subscription.updated, and customer.subscription.deleted. Not for direct client use.",
          responses: {
            200: { description: "Webhook received" },
            400: { description: "Invalid webhook signature" },
            500: { description: "Webhook handler error" },
          },
        },
      },
      "/api/support/help-center": {
        post: {
          tags: ["Support"],
          summary: "Submit a help center request",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HelpCenterRequest" },
              },
            },
          },
          responses: {
            201: { description: "Help center request submitted" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "userId does not match authenticated user" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/support/report-bug": {
        post: {
          tags: ["Support"],
          summary: "Report a bug",
          description:
            "Optional image attachment up to 3 MB (JPEG, PNG, GIF, WEBP).",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/ReportBugMultipartRequest",
                },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/ReportBugRequest" },
              },
            },
          },
          responses: {
            201: { description: "Bug report submitted" },
            400: {
              description: "Validation failed or attachment exceeds 3 MB",
            },
            401: { description: "Unauthorized" },
            404: { description: "User not found" },
            503: { description: "File storage is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/support/request-feature": {
        post: {
          tags: ["Support"],
          summary: "Request a feature",
          description:
            "Optional image attachment up to 3 MB (JPEG, PNG, GIF, WEBP).",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  $ref: "#/components/schemas/FeatureRequestMultipartRequest",
                },
              },
              "application/json": {
                schema: { $ref: "#/components/schemas/FeatureRequestRequest" },
              },
            },
          },
          responses: {
            201: { description: "Feature request submitted" },
            400: {
              description: "Validation failed or attachment exceeds 3 MB",
            },
            401: { description: "Unauthorized" },
            404: { description: "User not found" },
            503: { description: "File storage is not configured" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/dashboard": {
        get: {
          tags: ["Dashboard"],
          summary: "Get dashboard bootstrap data",
          description:
            "Returns user profile, ordered wallets with balances, paginated transactions for the first wallet in order, and upcoming planned payment occurrences within the requested day range.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "startDate",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Filter first-wallet transactions from this date",
            },
            {
              name: "endDate",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Filter first-wallet transactions until this date",
            },
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1, minimum: 1 },
              description: "Page number for first-wallet transactions",
            },
            {
              name: "perPage",
              in: "query",
              schema: {
                type: "integer",
                default: 20,
                minimum: 1,
                maximum: 100,
              },
              description: "Items per page for first-wallet transactions",
            },
            {
              name: "days",
              in: "query",
              required: true,
              schema: { type: "integer", minimum: 0 },
              description:
                "Number of days ahead to include upcoming planned payments",
            },
          ],
          responses: {
            200: { description: "Dashboard data" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/currencies": {
        get: {
          tags: ["Currencies"],
          summary: "List supported currencies with latest exchange rates",
          description:
            "Public endpoint. Returns active supported currencies and their latest rates relative to the base currency. No authentication required. Admin changes via /api/admin/currencies/* are reflected here immediately.",
          responses: {
            200: { description: "Currency list with rates" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/currencies/convert": {
        get: {
          tags: ["Currencies"],
          summary: "Get wallet currency conversion rates",
          description:
            "Returns the user's default currency and all unique wallet currencies, plus exchange rates for every ordered pair between them. Requires authentication and completed onboarding.",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Wallet currency conversions",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            $ref: "#/components/schemas/CurrencyConversionResponse",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            503: { description: "Exchange rates unavailable" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/app-settings": {
        get: {
          tags: ["App Settings"],
          summary: "Get mobile app configuration",
          description:
            "Public endpoint for app version, AdMob configuration, and app URLs. No authentication required.",
          responses: {
            200: {
              description: "App settings JSON",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      appJson: {
                        $ref: "#/components/schemas/AppSettingsJson",
                      },
                    },
                  },
                },
              },
            },
            500: { description: "Server error" },
          },
        },
        put: {
          tags: ["App Settings"],
          summary: "Update mobile app configuration",
          description:
            "Admin endpoint. Merges the provided sections into the stored app settings. Requires the x-api-key header.",
          security: [{ appSettingsApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["appJson"],
                  properties: {
                    appJson: {
                      $ref: "#/components/schemas/AppSettingsJson",
                    },
                  },
                },
                example: {
                  appJson: {
                    appConfig: {
                      version: "1.0.1",
                    },
                    urlConfig: {
                      supportEmail: "support@techflit.com",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Updated app settings",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SuccessResponse" },
                      {
                        type: "object",
                        properties: {
                          data: {
                            type: "object",
                            properties: {
                              appJson: {
                                $ref: "#/components/schemas/AppSettingsJson",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: { description: "Invalid request body" },
            401: { description: "Invalid or missing API key" },
            503: { description: "APP_SETTINGS_API_KEY is not configured" },
            500: { description: "Server error" },
          },
        },
      },
    },
  },
  apis: ["../routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
