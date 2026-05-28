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
const plannedPaymentRoutes = require("./routes/plannedPaymentRoutes");

const app = express();
connectDB();
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
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/planned-payments", plannedPaymentRoutes);
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
app.use((err, req, res, next) => {
  console.log(err);

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`Swagger /api/docs`);
});
