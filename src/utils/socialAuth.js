const { getFirebaseAuth } = require("../config/firebase");

const FIREBASE_SIGN_IN_PROVIDERS = {
  google: "google.com",
  apple: "apple.com",
};

const verifyProviderIdToken = async ({ provider, idToken }) => {
  const expectedFirebaseProvider = FIREBASE_SIGN_IN_PROVIDERS[provider];

  if (!expectedFirebaseProvider) {
    throw new Error("Unsupported auth provider");
  }

  if (!idToken || typeof idToken !== "string") {
    throw new Error("idToken is required");
  }

  const firebaseAuth = getFirebaseAuth();
  const decodedToken = await firebaseAuth.verifyIdToken(idToken);
  const signInProvider = decodedToken.firebase?.sign_in_provider;

  if (signInProvider !== expectedFirebaseProvider) {
    throw new Error(`Firebase token was not issued by ${provider}`);
  }

  const firebaseUser = await firebaseAuth.getUser(decodedToken.uid);

  return {
    ...decodedToken,
    sub: decodedToken.uid,
    email: decodedToken.email || firebaseUser.email,
    name: decodedToken.name || firebaseUser.displayName,
  };
};

module.exports = {
  verifyProviderIdToken,
};
