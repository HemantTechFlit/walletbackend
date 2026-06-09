const Stripe = require("stripe");

let stripeClient = null;

const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error("STRIPE_SECRET_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

const getCheckoutUrls = () => ({
  successUrl:
    process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
    "http://localhost:3000/subscription/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl:
    process.env.STRIPE_CHECKOUT_CANCEL_URL ||
    "http://localhost:3000/subscription/cancel",
});

module.exports = {
  getStripeClient,
  getCheckoutUrls,
};
