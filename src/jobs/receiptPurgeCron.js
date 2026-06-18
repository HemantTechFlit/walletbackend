const {
  purgeExpiredReceiptsForBasicUsers,
  RECEIPT_PURGE_DAY_OF_MONTH,
} = require("../utils/receiptUpload");

const getMsUntilNextPurgeRun = () => {
  const now = new Date();
  const purgeDay = RECEIPT_PURGE_DAY_OF_MONTH;
  let nextRun = new Date(
    now.getFullYear(),
    now.getMonth(),
    purgeDay,
    0,
    0,
    0,
    0,
  );

  if (now >= nextRun) {
    nextRun = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      purgeDay,
      0,
      0,
      0,
      0,
    );
  }

  return nextRun.getTime() - now.getTime();
};

const scheduleNextPurgeRun = (runJob) => {
  const delayMs = getMsUntilNextPurgeRun();
  setTimeout(() => {
    runJob().finally(() => {
      scheduleNextPurgeRun(runJob);
    });
  }, delayMs);
};

const startReceiptPurgeCron = () => {
  console.log("startReceiptPurgeCron");
  const runJob = async () => {
    try {
      const result = await purgeExpiredReceiptsForBasicUsers();
      if (result.purgedUserCount > 0) {
        console.log(
          `Receipt purge completed: ${result.purgedReceiptCount} receipt(s) removed for ${result.purgedUserCount} user(s).`,
        );
      }
    } catch (error) {
      console.error("Receipt purge cron failed:", error.message);
    }
  };

  scheduleNextPurgeRun(runJob);
};

module.exports = {
  startReceiptPurgeCron,
  getMsUntilNextPurgeRun,
};
