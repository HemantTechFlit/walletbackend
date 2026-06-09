const mongoose = require("mongoose");

const Attachment = require("../models/Attachment");
const { uploadReceipt } = require("./r2Storage");
const { getEffectivePlanForUser } = require("./planLimits");

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

  await Attachment.deleteMany(filter, options);
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
  getUserReceiptStorageUsedBytes,
  getReplacingReceiptBytes,
  assertCanUploadReceipt,
  deleteReceiptAttachmentsForTransactions,
  createReceiptAttachment,
};
