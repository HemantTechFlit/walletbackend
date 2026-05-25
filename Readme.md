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
- Voice transaction drafts for confirmation
- Unified transaction timeline
- Transaction update/delete handling
- Transaction rollback safety

---

## Voice Transaction Drafts

The backend accepts transcript text at `POST /api/voice/transaction-draft`.
It asks a local or self-hosted LLM for a structured income, expense, or transfer
draft, resolves spoken date phrases in the backend, and returns a payload for
the frontend to confirm or edit. It does not create the transaction.

For local model extraction, run an Ollama-compatible server and configure:

```env
VOICE_LLM_BASE_URL=http://localhost:11434
VOICE_LLM_MODEL=qwen3:8b
VOICE_LLM_TIMEOUT_MS=30000
```

The frontend should record voice, run speech-to-text, and send the transcript
capture context as JSON:

```json
{
  "transcript": "I spent 40 dollars for food last Monday",
  "referenceDate": "2026-05-21T10:00:00.000Z",
  "timezone": "Asia/Kolkata"
}
```

After user confirmation, call `POST /api/transactions` for income or expense
drafts and `POST /api/transfers` for transfer drafts.

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
