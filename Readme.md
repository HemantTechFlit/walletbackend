# Expense Tracker Backend

Scalable fintech-style backend built using Node.js, Express.js, MongoDB, and Mongoose.

This project is designed with:

- scalability
- transactional consistency
- wallet management
- subscription plans
- analytics-ready architecture
- production-grade MongoDB design

---

# Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- MongoDB Transactions
- AWS S3 / Cloudflare R2
- BullMQ (planned)
- Redis (planned)

---

# Features

## Authentication

- Signup
- Login
- Verify OTP
- Forgot Password
- Reset Password
- JWT Authentication
- Refresh Token Flow
- Session Management

---

## Wallet Management

- Multiple wallets
- Wallet balance tracking
- Wallet archiving
- Wallet restrictions based on plans

---

## Transactions

- Income transactions
- Expense transactions
- Transfer transactions
- Unified transaction timeline
- Transaction update/delete handling
- Transaction rollback safety

---

## Subscription Plans

### Free Plan

- Max 3 wallets
- No file upload

### Premium Plan

- Max 10 wallets
- File upload up to 1GB

### Premium+

- Unlimited wallets
- Unlimited storage

---

## File Upload

- Receipt uploads
- Storage usage tracking
- Plan-based upload restriction

---

# Database Architecture

## Collections

```txt
users
wallets
wallet_transactions
transaction_categories
subscriptions
plans
sessions
notifications
audit_logs
attachments
otps
```
