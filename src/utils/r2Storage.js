const path = require("path");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const trimSlashes = (value) => String(value || "").replace(/^\/+|\/+$/g, "");

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    const err = new Error(`${name} is required for Cloudflare R2 uploads`);
    err.statusCode = 503;
    throw err;
  }
  return value;
};

const getR2Client = () =>
  new S3Client({
    region: "auto",
    endpoint: getRequiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

const buildPublicUrl = (key) => {
  if (process.env.R2_PUBLIC_BASE_URL) {
    return `${trimSlashes(process.env.R2_PUBLIC_BASE_URL)}/${key}`;
  }

  const endpoint = trimSlashes(getRequiredEnv("R2_ENDPOINT"));
  const bucket = trimSlashes(getRequiredEnv("R2_BUCKET_NAME"));
  return `${endpoint}/${bucket}/${key}`;
};

const safeExtension = (originalName, fallback = ".bin") => {
  const ext = path.extname(originalName || "").toLowerCase();
  return ext && ext.length <= 10 ? ext : fallback;
};

const uploadBufferToR2 = async ({
  buffer,
  mimeType,
  originalName,
  keyPrefix,
  fileName,
}) => {
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const key = `${trimSlashes(keyPrefix)}/${fileName}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: originalName ? { originalName } : undefined,
    }),
  );

  return {
    key,
    url: buildPublicUrl(key),
  };
};

const deleteFromR2 = async (storageKey) => {
  if (!storageKey) {
    return;
  }

  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: getRequiredEnv("R2_BUCKET_NAME"),
        Key: storageKey,
      }),
    );
  } catch (error) {
    console.error(`Failed to delete R2 object ${storageKey}:`, error.message);
  }
};

const uploadProfileImage = async ({ buffer, mimeType, originalName, userId }) => {
  const ext = safeExtension(originalName, ".jpg");
  const fileName = `profile-${userId}-${Date.now()}${ext}`;
  const uploaded = await uploadBufferToR2({
    buffer,
    mimeType,
    originalName,
    keyPrefix: `profiles/${userId}`,
    fileName,
  });

  return uploaded.url;
};

const uploadReport = async ({ buffer, mimeType, fileName, userId }) => {
  const uploaded = await uploadBufferToR2({
    buffer,
    mimeType,
    keyPrefix: `reports/${userId}`,
    fileName,
  });

  return uploaded.url;
};

const uploadSupportImage = async ({ buffer, mimeType, originalName, userId }) => {
  const ext = safeExtension(originalName, ".jpg");
  const fileName = `support-${userId}-${Date.now()}${ext}`;

  return uploadBufferToR2({
    buffer,
    mimeType,
    originalName,
    keyPrefix: `support/${userId}`,
    fileName,
  });
};

const uploadReceipt = async ({ buffer, mimeType, originalName, userId }) => {
  const fallback = mimeType === "application/pdf" ? ".pdf" : ".jpg";
  const ext = safeExtension(originalName, fallback);
  const fileName = `receipt-${userId}-${Date.now()}${ext}`;

  return uploadBufferToR2({
    buffer,
    mimeType,
    originalName,
    keyPrefix: `receipts/${userId}`,
    fileName,
  });
};

module.exports = {
  uploadProfileImage,
  uploadReport,
  uploadSupportImage,
  uploadReceipt,
  deleteFromR2,
};
