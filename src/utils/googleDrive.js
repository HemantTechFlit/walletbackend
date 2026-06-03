const { Readable } = require("stream");
const path = require("path");
const { google } = require("googleapis");

const DEFAULT_FOLDER_ID = "1OeeD4_4X1iGSMLRNGSB5WeDjIzhchK89";
const DEFAULT_REPORTS_FOLDER_ID = "1FXLNBJB2sIOVEEz_jGClfwrqt7-__7bi";

const driveRequestOptions = {
  supportsAllDrives: true,
};

const buildDriveImageViewUrl = (fileId) =>
  `https://drive.google.com/uc?export=view&id=${fileId}`;

const buildDriveDownloadUrl = (fileId) =>
  `https://drive.google.com/uc?export=download&id=${fileId}`;

const getOAuthDriveClient = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: "v3", auth: oauth2 });
};

const getServiceAccountDriveClient = () => {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  } else {
    return null;
  }

  return google.drive({ version: "v3", auth });
};

const getDriveClient = () => {
  const oauthDrive = getOAuthDriveClient();
  if (oauthDrive) {
    return { drive: oauthDrive, mode: "oauth" };
  }

  const serviceDrive = getServiceAccountDriveClient();
  if (serviceDrive) {
    return { drive: serviceDrive, mode: "service_account" };
  }

  throw new Error(
    "Google Drive is not configured. For personal Drive folders use OAuth: " +
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN. " +
      "Or use a service account only with a Shared Drive (Google Workspace).",
  );
};

const handleDriveUploadError = (error, mode) => {
  const message = error?.message || "";

  if (message === "invalid_grant" && mode === "oauth") {
    const err = new Error(
      "Google Drive OAuth refresh token is invalid or expired. Regenerate GOOGLE_DRIVE_REFRESH_TOKEN using the same OAuth client and Drive account.",
    );
    err.statusCode = 503;
    throw err;
  }

  if (message.includes("storage quota") && mode === "service_account") {
    const err = new Error(
      "Service accounts cannot upload to personal Google Drive folders. " +
        "Use OAuth instead: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, " +
        "and GOOGLE_DRIVE_REFRESH_TOKEN (from the Google account that owns the folder).",
    );
    err.statusCode = 503;
    throw err;
  }

  throw error;
};

const uploadBufferToDrive = async ({ buffer, mimeType, fileName, folderId }) => {
  const { drive, mode } = getDriveClient();

  try {
    const created = await drive.files.create({
      ...driveRequestOptions,
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType,
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id",
    });

    const fileId = created.data.id;

    await drive.permissions.create({
      fileId,
      ...driveRequestOptions,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    return fileId;
  } catch (error) {
    handleDriveUploadError(error, mode);
  }
};

const uploadProfileImageToDrive = async ({
  buffer,
  mimeType,
  originalName,
  userId,
}) => {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

  const ext = path.extname(originalName || "") || ".jpg";
  const safeExt = ext.length <= 10 ? ext : ".jpg";
  const fileName = `profile-${userId}-${Date.now()}${safeExt}`;

  const fileId = await uploadBufferToDrive({
    buffer,
    mimeType,
    fileName,
    folderId,
  });

  return buildDriveImageViewUrl(fileId);
};

const uploadReportToDrive = async ({ buffer, mimeType, fileName }) => {
  const folderId =
    process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID || DEFAULT_REPORTS_FOLDER_ID;

  const fileId = await uploadBufferToDrive({
    buffer,
    mimeType,
    fileName,
    folderId,
  });

  return buildDriveDownloadUrl(fileId);
};

module.exports = {
  uploadProfileImageToDrive,
  uploadReportToDrive,
  buildDriveImageViewUrl,
  buildDriveDownloadUrl,
  DEFAULT_FOLDER_ID,
  DEFAULT_REPORTS_FOLDER_ID,
};
