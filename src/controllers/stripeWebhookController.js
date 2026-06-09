const { getStripeClient } = require("../utils/stripe");
const {
  fulfillCheckoutFromSession,
  syncSubscriptionFromStripe,
  handleStripeSubscriptionDeleted,
} = require("../services/subscriptionService");

const handleStripeWebhook = async (req, res) => {
  const stripe = getStripeClient();
  const signature = req.headers["stripe-signature"];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({
      success: false,
      message: "STRIPE_WEBHOOK_SECRET is not configured",
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: `Webhook signature verification failed: ${error.message}`,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await fulfillCheckoutFromSession(event.data.object);
        break;
      }
      case "customer.subscription.updated": {
        await syncSubscriptionFromStripe(event.data.object.id);
        break;
      }
      case "customer.subscription.deleted": {
        await handleStripeSubscriptionDeleted(event.data.object);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  handleStripeWebhook,
};
