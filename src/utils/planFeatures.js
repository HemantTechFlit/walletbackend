const normalizeFeatureItem = (item) => {
  if (typeof item === "string") {
    const title = item.trim();
    if (!title) {
      return null;
    }

    return {
      title,
      icon: "",
      description: "",
    };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const title = String(item.title || "").trim();
  if (!title) {
    return null;
  }

  return {
    title,
    icon: String(item.icon || "").trim(),
    description: String(item.description || "").trim(),
  };
};

const normalizePlanFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features.map(normalizeFeatureItem).filter(Boolean);
};

const parsePlanFeaturesInput = (value) => {
  if (!Array.isArray(value)) {
    const error = new Error("features must be an array");
    error.statusCode = 400;
    throw error;
  }

  const parsed = normalizePlanFeatures(value);

  if (parsed.length === 0 && value.length > 0) {
    const error = new Error("Each feature must include a title");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const toPlanFeatureSeed = (title, icon = "", description = "") => ({
  title,
  icon,
  description,
});

module.exports = {
  normalizeFeatureItem,
  normalizePlanFeatures,
  parsePlanFeaturesInput,
  toPlanFeatureSeed,
};
