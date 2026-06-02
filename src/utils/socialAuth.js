const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWKS_URLS = {
  google: "https://www.googleapis.com/oauth2/v3/certs",
  apple: "https://appleid.apple.com/auth/keys",
};

const ISSUERS = {
  google: ["accounts.google.com", "https://accounts.google.com"],
  apple: ["https://appleid.apple.com"],
};

const jwksCache = new Map();

const parseCsvEnv = (...names) =>
  names
    .flatMap((name) => (process.env[name] || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

const getAudiences = (provider) => {
  if (provider === "google") {
    return parseCsvEnv("GOOGLE_CLIENT_IDS", "GOOGLE_CLIENT_ID");
  }

  return parseCsvEnv(
    "APPLE_CLIENT_IDS",
    "APPLE_CLIENT_ID",
    "APPLE_BUNDLE_ID",
    "APPLE_SERVICE_ID",
  );
};

const fetchJwks = async (provider) => {
  const cached = jwksCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(JWKS_URLS[provider]);
  if (!response.ok) {
    throw new Error(`${provider} public keys could not be fetched`);
  }

  const body = await response.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];

  jwksCache.set(provider, {
    keys,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });

  return keys;
};

const getPublicKey = async (provider, kid) => {
  const keys = await fetchJwks(provider);
  const jwk = keys.find((key) => key.kid === kid);

  if (!jwk) {
    jwksCache.delete(provider);
    const refreshedKeys = await fetchJwks(provider);
    const refreshedJwk = refreshedKeys.find((key) => key.kid === kid);
    if (!refreshedJwk) {
      throw new Error(`${provider} public key not found`);
    }
    return crypto.createPublicKey({ key: refreshedJwk, format: "jwk" });
  }

  return crypto.createPublicKey({ key: jwk, format: "jwk" });
};

const verifyProviderIdToken = async ({ provider, idToken }) => {
  if (!JWKS_URLS[provider]) {
    throw new Error("Unsupported auth provider");
  }

  if (!idToken || typeof idToken !== "string") {
    throw new Error("idToken is required");
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    throw new Error("Invalid idToken");
  }

  const audiences = getAudiences(provider);
  if (audiences.length === 0) {
    throw new Error(`${provider} client id is not configured`);
  }

  const publicKey = await getPublicKey(provider, decoded.header.kid);

  return jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: audiences,
    issuer: ISSUERS[provider],
  });
};

module.exports = {
  verifyProviderIdToken,
};
