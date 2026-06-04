const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const readJsonFile = (filePath) => {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
};

const parseServiceAccount = () => {
  const base64Value = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const jsonValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const fileValue =
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (base64Value) {
    return JSON.parse(Buffer.from(base64Value, "base64").toString("utf8"));
  }

  if (jsonValue) {
    if (jsonValue.endsWith(".json")) {
      return readJsonFile(jsonValue);
    }

    return JSON.parse(jsonValue);
  }

  if (fileValue) {
    return readJsonFile(fileValue);
  }

  return null;
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = parseServiceAccount();
  const options = {};

  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  }

  if (process.env.FIREBASE_PROJECT_ID) {
    options.projectId = process.env.FIREBASE_PROJECT_ID;
  }

  return admin.initializeApp(options);
};

const firebaseApp = initializeFirebaseAdmin();

const getFirebaseAuth = () => admin.auth(firebaseApp);

module.exports = {
  getFirebaseAuth,
};
