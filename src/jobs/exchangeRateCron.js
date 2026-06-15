const { refreshExchangeRates } = require("../services/exchangeRateService");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getMsUntilNextMidnight = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
};

const startExchangeRateCron = () => {
  const runJob = async () => {
    try {
      await refreshExchangeRates({ force: true });
    } catch (error) {
      console.error("Exchange rate cron failed:", error.message);
    }
  };

  setTimeout(() => {
    runJob();
    setInterval(runJob, MS_PER_DAY);
  }, getMsUntilNextMidnight());

  console.log("🕛 Exchange rate cron scheduled for daily midnight refresh");
};

module.exports = {
  startExchangeRateCron,
};
