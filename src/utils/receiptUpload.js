const mongoose = require("mongoose");

const Attachment = require("../models/Attachment");
const WalletTransaction = require("../models/WalletTransaction");
const WalletTransfer = require("../models/WalletTransfer");
const User = require("../models/User");
const { uploadReceipt, deleteFromR2 } = require("./r2Storage");
const { getEffectivePlanForUser, BASIC_PLAN_NAME } = require("./planLimits");

const RECEIPT_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const getUserReceiptStorageUsedBytes = async (userId, session = null) => {
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        purpose: "RECEIPT",
      },
    },
    { $group: { _id: null, total: { $sum: "$fileSize" } } },
  ];

  let query = Attachment.aggregate(pipeline);
  if (session) {
    query = query.session(session);
  }

  const result = await query;
  return result[0]?.total ?? 0;
};

const recalculateUserReceiptStorage = async (userId, session = null) => {
  const usedBytes = await getUserReceiptStorageUsedBytes(userId, session);
  const options = session ? { session } : {};

  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        receiptStorageUsedBytes: usedBytes,
        updatedAt: new Date(),
      },
    },
    options,
  );

  return usedBytes;
};

const buildReceiptStorageInfo = async (
  userId,
  plan,
  { recalculate = false } = {},
) => {
  let usedBytes;

  if (recalculate) {
    usedBytes = await recalculateUserReceiptStorage(userId);
  } else {
    const user = await User.findById(userId)
      .select("receiptStorageUsedBytes")
      .lean();
    usedBytes = user?.receiptStorageUsedBytes ?? 0;
  }

  const limitMB = plan?.cloudStorageLimitMB ?? 0;
  const limitBytes = limitMB * 1024 * 1024;

  return {
    usedBytes,
    usedMB: Number((usedBytes / (1024 * 1024)).toFixed(2)),
    limitMB,
    limitBytes,
    isOverLimit: limitBytes > 0 && usedBytes > limitBytes,
  };
};

const getReplacingReceiptBytes = async ({
  userId,
  transactionIds,
  session = null,
}) => {
  if (!transactionIds?.length) {
    return 0;
  }

  const filter = {
    userId,
    purpose: "RECEIPT",
    transactionId: { $in: transactionIds },
  };

  let query = Attachment.find(filter).select("fileSize").lean();
  if (session) {
    query = query.session(session);
  }

  const attachments = await query;
  return attachments.reduce((sum, item) => sum + (item.fileSize || 0), 0);
};

const assertCanUploadReceipt = async (
  userId,
  fileSize,
  { replacingBytes = 0, session = null } = {},
) => {
  const size = Number(fileSize);

  if (!size || size <= 0) {
    const err = new Error("Invalid receipt file size");
    err.statusCode = 400;
    throw err;
  }

  if (size > RECEIPT_MAX_FILE_SIZE_BYTES) {
    const err = new Error("Receipt must be 15 MB or smaller");
    err.statusCode = 400;
    throw err;
  }

  const { plan } = await getEffectivePlanForUser(userId);

  if (!plan || plan.cloudStorageLimitMB === 0) {
    const err = new Error(
      "Receipt upload is not available on the free plan. Upgrade to Premium or Premium+ to upload receipts.",
    );
    err.statusCode = 403;
    throw err;
  }

  const limitBytes = plan.cloudStorageLimitMB * 1024 * 1024;
  const usedBytes = await getUserReceiptStorageUsedBytes(userId, session);
  const projectedBytes = usedBytes - replacingBytes + size;

  if (projectedBytes > limitBytes) {
    const err = new Error(
      `Receipt storage limit reached (${plan.cloudStorageLimitMB} MB). Upgrade your plan to upload more receipts.`,
    );
    err.statusCode = 403;
    throw err;
  }
};

const deleteReceiptAttachmentsForTransactions = async ({
  userId,
  transactionIds,
  session = null,
}) => {
  if (!transactionIds?.length) {
    return;
  }

  const filter = {
    userId,
    purpose: "RECEIPT",
    transactionId: { $in: transactionIds },
  };
  const options = session ? { session } : {};

  let query = Attachment.find(filter).select("storageKey").lean();
  if (session) {
    query = query.session(session);
  }

  const attachments = await query;
  await Promise.all(attachments.map((item) => deleteFromR2(item.storageKey)));

  await Attachment.deleteMany(filter, options);
  await recalculateUserReceiptStorage(userId, session);
};

const RECEIPT_RETENTION_DAYS = 30;
const RECEIPT_PURGE_DAY_OF_MONTH = 2;

const userHasStoredReceipts = async (userId, session = null) => {
  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    purpose: "RECEIPT",
  };
  const options = session ? { session } : {};

  const count = await Attachment.countDocuments(filter, options);
  return count > 0;
};

const purgeAllReceiptsForUser = async (userId, session = null) => {
  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    purpose: "RECEIPT",
  };

  let query = Attachment.find(filter)
    .select("_id storageKey transactionId")
    .lean();
  if (session) {
    query = query.session(session);
  }

  const attachments = await query;
  if (!attachments.length) {
    return 0;
  }

  await Promise.all(attachments.map((item) => deleteFromR2(item.storageKey)));

  const attachmentIds = attachments.map((item) => item._id);
  const transactionIds = attachments
    .map((item) => item.transactionId)
    .filter(Boolean);

  const options = session ? { session } : {};
  await Attachment.deleteMany({ _id: { $in: attachmentIds } }, options);
  await clearReceiptFieldsOnTransactions(transactionIds, session);
  await recalculateUserReceiptStorage(userId, session);

  return attachments.length;
};

const clearReceiptFieldsOnTransactions = async (
  transactionIds,
  session = null,
) => {
  if (!transactionIds?.length) {
    return;
  }

  const update = {
    $unset: { receipt: "" },
    $set: { updatedAt: new Date() },
  };
  const options = session ? { session } : {};

  await WalletTransaction.updateMany(
    { _id: { $in: transactionIds } },
    update,
    options,
  );

  const transfers = await WalletTransfer.find({
    debitTransactionId: { $in: transactionIds },
  })
    .select("creditTransactionId")
    .lean();

  const creditTransactionIds = transfers
    .map((item) => item.creditTransactionId)
    .filter(Boolean);

  if (creditTransactionIds.length) {
    await WalletTransaction.updateMany(
      { _id: { $in: creditTransactionIds } },
      update,
      options,
    );
  }

  await WalletTransfer.updateMany(
    { debitTransactionId: { $in: transactionIds } },
    update,
    options,
  );
};

const purgeExpiredReceiptsForBasicUsers = async () => {
  const now = new Date();

  const users = await User.find({
    receiptDeletionScheduledAt: { $ne: null, $lte: now },
    isDeleted: false,
  })
    .select("_id")
    .lean();

  let purgedUserCount = 0;
  let purgedReceiptCount = 0;

  for (const user of users) {
    const { plan } = await getEffectivePlanForUser(user._id);
    if (!plan || plan.name !== BASIC_PLAN_NAME) {
      continue;
    }

    const hasReceipts = await userHasStoredReceipts(user._id);
    if (!hasReceipts) {
      const { clearReceiptRetention } = require("./planLimits");
      await clearReceiptRetention(user._id);
      await recalculateUserReceiptStorage(user._id);
      continue;
    }

    const deletedCount = await purgeAllReceiptsForUser(user._id);
    if (deletedCount > 0) {
      purgedUserCount += 1;
      purgedReceiptCount += deletedCount;
    }

    const { clearReceiptRetention } = require("./planLimits");
    await clearReceiptRetention(user._id);
  }

  return { purgedUserCount, purgedReceiptCount };
};

const buildReceiptRetentionInfo = (user) => {
  const deletingDate = user?.receiptDeletionScheduledAt || null;
  const showWarning = Boolean(deletingDate);

  return {
    showWarning,
    deletingDate,
  };
};

const buildReceiptRetentionWarnings = async (user) => {
  const { showWarning } = buildReceiptRetentionInfo(user);
  if (!showWarning) {
    return [];
  }

  return [
    {
      type: "RECEIPT_DELETION",
      message: `Your uploaded receipts will be automatically deleted on ${new Date(
        user.receiptDeletionScheduledAt,
      ).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })} because you moved to the Basic plan.`,
    },
  ];
};

const createReceiptAttachment = async ({
  userId,
  transactionId,
  file,
  session = null,
  replaceTransactionIds = [],
}) => {
  if (!file) {
    return null;
  }

  const replacingBytes = replaceTransactionIds.length
    ? await getReplacingReceiptBytes({
        userId,
        transactionIds: replaceTransactionIds,
        session,
      })
    : 0;

  await assertCanUploadReceipt(userId, file.size, { replacingBytes, session });

  if (replaceTransactionIds.length) {
    await deleteReceiptAttachmentsForTransactions({
      userId,
      transactionIds: replaceTransactionIds,
      session,
    });
  }

  const uploaded = await uploadReceipt({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    userId,
  });

  const createOptions = session ? { session } : {};
  const attachments = await Attachment.create(
    [
      {
        userId,
        transactionId,
        fileUrl: uploaded.url,
        storageKey: uploaded.key,
        originalName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        purpose: "RECEIPT",
      },
    ],
    createOptions,
  );

  const attachment = attachments[0];

  await recalculateUserReceiptStorage(userId, session);

  return {
    attachmentId: attachment._id,
    fileUrl: attachment.fileUrl,
    storageKey: attachment.storageKey,
    originalName: attachment.originalName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    uploadedAt: attachment.uploadedAt,
  };
};

module.exports = {
  RECEIPT_MAX_FILE_SIZE_BYTES,
  RECEIPT_RETENTION_DAYS,
  RECEIPT_PURGE_DAY_OF_MONTH,
  getUserReceiptStorageUsedBytes,
  recalculateUserReceiptStorage,
  buildReceiptStorageInfo,
  getReplacingReceiptBytes,
  assertCanUploadReceipt,
  deleteReceiptAttachmentsForTransactions,
  createReceiptAttachment,
  userHasStoredReceipts,
  purgeAllReceiptsForUser,
  purgeExpiredReceiptsForBasicUsers,
  buildReceiptRetentionInfo,
  buildReceiptRetentionWarnings,
};
