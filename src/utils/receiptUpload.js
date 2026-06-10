const mongoose = require("mongoose");

const Attachment = require("../models/Attachment");
const WalletTransaction = require("../models/WalletTransaction");
const WalletTransfer = require("../models/WalletTransfer");
const User = require("../models/User");
const { uploadReceipt, deleteFromR2 } = require("./r2Storage");
const {
  getEffectivePlanForUser,
  getBasicPlan,
  BASIC_PLAN_NAME,
} = require("./planLimits");

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
};

const RECEIPT_RETENTION_DAYS = 30;

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
  const retentionCutoff = new Date(
    Date.now() - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const users = await User.find({
    receiptRetentionStartedAt: { $ne: null },
    isDeleted: false,
  })
    .select("_id subscriptionId")
    .lean();

  for (const user of users) {
    const { plan } = await getEffectivePlanForUser(user._id);
    if (!plan || plan.name !== BASIC_PLAN_NAME) {
      continue;
    }

    const expiredAttachments = await Attachment.find({
      userId: user._id,
      purpose: "RECEIPT",
      uploadedAt: { $lte: retentionCutoff },
    })
      .select("_id storageKey transactionId")
      .lean();

    if (!expiredAttachments.length) {
      continue;
    }

    await Promise.all(
      expiredAttachments.map((item) => deleteFromR2(item.storageKey)),
    );

    const attachmentIds = expiredAttachments.map((item) => item._id);
    const transactionIds = expiredAttachments
      .map((item) => item.transactionId)
      .filter(Boolean);

    await Attachment.deleteMany({ _id: { $in: attachmentIds } });
    await clearReceiptFieldsOnTransactions(transactionIds);
  }
};

const buildReceiptRetentionWarnings = async (user, plan, subscription) => {
  const warnings = [];
  const basicPlan = await getBasicPlan();
  const pendingPlanId =
    subscription?.pendingPlanId?._id || subscription?.pendingPlanId;
  const movingToBasic =
    pendingPlanId && String(pendingPlanId) === String(basicPlan._id);
  const onBasicWithRetention =
    plan?.name === BASIC_PLAN_NAME && user.receiptRetentionStartedAt;

  if (movingToBasic || onBasicWithRetention) {
    warnings.push({
      type: "RECEIPT_DELETION",
      message:
        "When you are on the Basic plan, uploaded receipts will be automatically deleted 30 days after their upload date.",
    });
  }

  return warnings;
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
  getUserReceiptStorageUsedBytes,
  getReplacingReceiptBytes,
  assertCanUploadReceipt,
  deleteReceiptAttachmentsForTransactions,
  createReceiptAttachment,
  purgeExpiredReceiptsForBasicUsers,
  buildReceiptRetentionWarnings,
};
