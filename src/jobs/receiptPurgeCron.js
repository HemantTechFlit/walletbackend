const { purgeExpiredReceiptsForBasicUsers } = require("../utils/receiptUpload");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getMsUntilNextMidnight = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
};

const startReceiptPurgeCron = () => {
  const runJob = async () => {
    try {
      await purgeExpiredReceiptsForBasicUsers();
    } catch (error) {
      console.error("Receipt purge cron failed:", error.message);
    }
  };
  setTimeout(() => {
    runJob();
    setInterval(runJob, MS_PER_DAY);
  }, getMsUntilNextMidnight());
};

module.exports = {
  startReceiptPurgeCron,
};
