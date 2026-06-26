require("dotenv").config();
const path = require("path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
// const seedDatabase = require("./seed");
const connectDB = require("./config/database");
const swaggerSpec = require("./config/swagger");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const walletRoutes = require("./routes/walletRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const transferRoutes = require("./routes/transferRoutes");
const voiceRoutes = require("./routes/voiceRoutes");
const reportRoutes = require("./routes/reportRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const subscriptionCheckoutPageRoutes = require("./routes/subscriptionCheckoutPageRoutes");
const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");
const plannedPaymentRoutes = require("./routes/plannedPaymentRoutes");
const supportRoutes = require("./routes/supportRoutes");
const appSettingsRoutes = require("./routes/appSettingsRoutes");
const currencyRoutes = require("./routes/currencyRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const adminRoutes = require("./routes/adminRoutes");
const legalRoutes = require("./routes/legalRoutes");
const { startReceiptPurgeCron } = require("./jobs/receiptPurgeCron");
const { startExchangeRateCron } = require("./jobs/exchangeRateCron");

const app = express();
connectDB();
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes,
);
app.use(express.json());
app.use(
  "/public/reports",
  express.static(path.join(__dirname, "..", "storage", "reports")),
);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/subscription", subscriptionCheckoutPageRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/planned-payments", plannedPaymentRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/app-settings", appSettingsRoutes);
app.use("/api/currencies", currencyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/legal", legalRoutes);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
app.get("/api-docs", (req, res) => res.redirect("/api/docs"));
app.get("/api-docs.json", (req, res) => res.redirect("/api/docs.json"));
app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Expense Tracker API Running",
  });
});

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.log(err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large",
    });
  }

  const statusCode = Number(err.statusCode || err.status) || 500;
  const message =
    statusCode >= 500 ? "Internal Server Error" : err.message || "Request failed";

  return res.status(statusCode).json({
    success: false,
    message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`Swagger /api/docs`);
  startReceiptPurgeCron();
  startExchangeRateCron();
});
