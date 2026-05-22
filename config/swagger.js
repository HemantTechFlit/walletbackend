const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Wallet Backend API",
      version: "1.0.0",
      description:
        "Expense / income tracker backend: authentication, onboarding, users, wallets, categories, transactions, transfers, reports, and subscriptions.",
    },
    servers: [
      {
        url: "https://expense-tracker-ip37.onrender.com",
        description: "Expense Tracker API production server",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication APIs" },
      { name: "Onboarding", description: "Onboarding APIs" },
      { name: "Users", description: "Current user profile and preferences" },
      {
        name: "Wallets",
        description: "User wallets (requires completed onboarding)",
      },
      { name: "Categories", description: "Transaction categories" },
      { name: "Transactions", description: "Income and expense entries" },
      { name: "Transfers", description: "Wallet-to-wallet transfers" },
      {
        name: "Reports",
        description: "CSV/PDF reports uploaded to Google Drive",
      },
      {
        name: "Subscriptions",
        description: "User subscription and effective plan",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
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
        SignupRequest: {
          type: "object",
          required: [
            "fullName",
            "email",
            "password",
            "mobileNumber",
            "currency",
          ],
          properties: {
            fullName: { type: "string", example: "Hemant Kumar" },
            email: { type: "string", example: "hemant@gmail.com" },
            password: { type: "string", example: "Password@123" },
            mobileNumber: { type: "string", example: "9876543210" },
            currency: {
              type: "string",
              description: "ISO 4217 currency code (3 letters)",
              example: "USD",
              minLength: 3,
              maxLength: 3,
            },
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
          required: ["selectedWallets", "selectedCategories"],
          properties: {
            selectedWallets: {
              type: "array",
              items: { type: "string", example: "6820752aebf84d7a6394c164" },
            },
            selectedCategories: {
              type: "array",
              items: { type: "string", example: "6820752aebf84d7a6394c16a" },
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
            currency: { type: "string", example: "AUD" },
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
            "multipart/form-data. Image is uploaded to Google Drive and the link is saved on the user.",
          properties: {
            fullName: { type: "string", example: "Hemant Kumar" },
            mobileNumber: { type: "string", example: "9876543210" },
            currency: { type: "string", example: "USD" },
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
        CreateWalletRequest: {
          type: "object",
          required: ["walletName"],
          properties: {
            walletName: { type: "string", example: "Savings Wallet" },
          },
        },
        CreateCategoryRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Groceries" },
          },
        },
        UpdateCategoryRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Food" },
          },
        },
        CreateTransactionRequest: {
          type: "object",
          required: ["walletId", "categoryId", "type", "amount", "title"],
          properties: {
            walletId: { type: "string" },
            categoryId: { type: "string" },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            amount: { type: "number", example: 99.5 },
            title: { type: "string", example: "Salary" },
            description: { type: "string", nullable: true },
            transactionDate: {
              type: "string",
              format: "date-time",
              description: "Defaults to now if omitted",
            },
          },
        },
        CreateTransferRequest: {
          type: "object",
          required: ["fromWalletId", "toWalletId", "amount"],
          properties: {
            fromWalletId: { type: "string" },
            toWalletId: { type: "string" },
            amount: { type: "number", example: 50 },
            title: { type: "string", example: "Move to savings" },
            description: { type: "string", nullable: true },
            transferDate: { type: "string", format: "date-time" },
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
              enum: ["CSV", "PDF"],
              example: "CSV",
            },
            filters: { type: "object", additionalProperties: true },
          },
        },
        SubscribeRequest: {
          type: "object",
          required: ["planId"],
          properties: {
            planId: { type: "string" },
            walletId: {
              type: "string",
              description:
                "Required for paid plans (Premium, Premium+). User wallet used to pay; stored as paymentProvider (wallet name).",
            },
            amountPaid: { type: "number", example: 2 },
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
      "/api/auth/onboarding-options": {
        get: {
          tags: ["Onboarding"],
          summary: "Get onboarding wallet/category options",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Options fetched" },
            401: { description: "Unauthorized" },
            500: { description: "Server error" },
          },
        },
      },
      "/api/auth/complete-onboarding": {
        post: {
          tags: ["Onboarding"],
          summary: "Save selected onboarding options",
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
            500: { description: "Server error" },
          },
        },
      },
      "/api/users/me": {
        get: {
          tags: ["Users"],
          summary: "Get current user (with plan summary)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "User profile" },
            401: { description: "Unauthorized" },
            404: { description: "User not found" },
            500: { description: "Server error" },
          },
        },
        patch: {
          tags: ["Users"],
          summary: "Update current user profile (multipart for profile photo)",
          description:
            "Send **multipart/form-data** with field `profileImage` (file) to upload to [Google Drive folder](https://drive.google.com/drive/folders/1OeeD4_4X1iGSMLRNGSB5WeDjIzhchK89). Requires OAuth env vars (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) for personal Gmail folders — service accounts cannot use My Drive storage. Text fields can be sent as form fields in the same request.",
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
            200: {
              description: "Profile updated; profileImage is Google Drive URL",
            },
            400: { description: "Validation failed or invalid image" },
            401: { description: "Unauthorized" },
            503: { description: "Google Drive not configured" },
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
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "List of wallets" },
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
          summary: "Soft-delete wallet",
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
      },
      "/api/categories": {
        get: {
          tags: ["Categories"],
          summary: "List user categories",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Categories" },
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
          summary: "Soft-delete category",
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
          summary: "Create transaction",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateTransactionRequest",
                },
              },
            },
          },
          responses: {
            201: { description: "Transaction created" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
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
        delete: {
          tags: ["Transactions"],
          summary: "Soft-delete transaction",
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
            200: { description: "Transaction deleted" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Not found" },
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
          summary: "Create wallet-to-wallet transfer",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateTransferRequest" },
              },
            },
          },
          responses: {
            201: { description: "Transfer completed" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            403: { description: "Onboarding not completed" },
            404: { description: "Wallet not found" },
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
          summary: "Generate CSV or PDF report (uploaded to Google Drive)",
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
                "Report created; data.fileUrl is a public Google Drive download link",
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
          summary: "Download report (redirects to Google Drive link)",
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
            302: { description: "Redirect to Google Drive download URL" },
            200: {
              description: "Legacy local file stream (older reports only)",
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
          summary: "Get all plans with selected flag and current subscription",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description:
                "plans[] (each with selected: true on current plan), plan, subscription",
            },
            401: { description: "Unauthorized" },
            500: { description: "Server error" },
          },
        },
        post: {
          tags: ["Subscriptions"],
          summary: "Subscribe to a plan (demo: no payment gateway)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SubscribeRequest" },
              },
            },
          },
          responses: {
            201: { description: "Subscription activated" },
            400: { description: "Validation failed" },
            401: { description: "Unauthorized" },
            404: { description: "Plan not found" },
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
