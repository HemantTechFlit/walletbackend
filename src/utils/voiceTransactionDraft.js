const chrono = require("chrono-node");

const DRAFT_KIND = {
  TRANSACTION: "TRANSACTION",
  TRANSFER: "TRANSFER",
  UNKNOWN: "UNKNOWN",
};

const VOICE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: Object.values(DRAFT_KIND),
    },
    transactionType: {
      type: ["string", "null"],
      enum: ["INCOME", "EXPENSE", null],
    },
    amount: {
      type: ["number", "null"],
    },
    title: {
      type: ["string", "null"],
    },
    description: {
      type: ["string", "null"],
    },
    walletId: {
      type: ["string", "null"],
    },
    categoryId: {
      type: ["string", "null"],
    },
    fromWalletId: {
      type: ["string", "null"],
    },
    toWalletId: {
      type: ["string", "null"],
    },
    confidence: {
      type: "number",
    },
  },
  required: [
    "kind",
    "transactionType",
    "amount",
    "title",
    "description",
    "walletId",
    "categoryId",
    "fromWalletId",
    "toWalletId",
    "confidence",
  ],
};

const cleanString = (value, maxLength) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const cleanAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
};

const idSet = (items) => new Set(items.map((item) => item._id.toString()));

const cleanChoiceId = (value, choices) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  return choices.has(value) ? value : null;
};

const cleanConfidence = (value) => {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, confidence));
};

const defaultTitle = (kind, transactionType) => {
  if (kind === DRAFT_KIND.TRANSFER) {
    return "Wallet transfer";
  }

  return transactionType === "INCOME" ? "Voice income" : "Voice expense";
};

const parseReferenceDate = (referenceDate) => {
  const instant = referenceDate ? new Date(referenceDate) : new Date();

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  return instant;
};

const resolveDateFromTranscript = ({ transcript, referenceDate, timezone }) => {
  const parseReference = timezone
    ? { instant: referenceDate, timezone }
    : referenceDate;
  const parsedResults = chrono.parse(transcript, parseReference);
  const hasDate = (result) =>
    ["day", "month", "year", "weekday"].some((field) =>
      result?.start?.isCertain(field),
    );
  const hasTime = (result) => result?.start?.isCertain("hour");
  const combinedResult = parsedResults.find(
    (result) => hasDate(result) && hasTime(result),
  );
  const dateResult = parsedResults.find(hasDate);
  const timeResult = parsedResults.find(hasTime);
  const mergedResult =
    !combinedResult && dateResult && timeResult && dateResult !== timeResult
      ? chrono
          .parse(`${timeResult.text} ${dateResult.text}`, parseReference)
          .find((result) => hasDate(result) && hasTime(result))
      : null;
  const parsed = combinedResult || mergedResult || dateResult || timeResult;
  const date = parsed?.start?.date();

  if (date && !Number.isNaN(date.getTime())) {
    return {
      value: date.toISOString(),
      matchedText: mergedResult
        ? `${dateResult.text} ${timeResult.text}`
        : parsed.text,
      source: "CHRONO",
    };
  }

  return {
    value: referenceDate.toISOString(),
    matchedText: null,
    source: "REFERENCE_DATE",
  };
};

const ollamaBaseUrl = () =>
  (process.env.VOICE_LLM_BASE_URL || "http://localhost:11434").replace(/\/$/, "");

const ollamaTimeoutMs = () => {
  const configured = Number(process.env.VOICE_LLM_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
};

const buildPrompt = ({ transcript, wallets, categories, defaultWalletId, currency }) => `
Extract one pending wallet action from the spoken transcript.

Rules:
- Return only JSON matching the provided schema.
- Use kind TRANSACTION for one income or expense entry.
- Use kind TRANSFER only when money is moved between two wallets owned by the same user.
- Use kind UNKNOWN when the transcript is not a single wallet action.
- Positive money received is transactionType INCOME.
- Money spent, paid, bought, charged, or withdrawn is transactionType EXPENSE.
- Choose wallet and category ids only from the candidates below.
- For an ordinary transaction, infer the best categoryId from the purchase purpose, merchant, and category candidates even when the category name is not spoken.
- Set categoryId to null when no category candidate is semantically related to the spoken purchase purpose.
- Never choose an unrelated category only to fill categoryId.
- If the user explicitly says a category name and it is not in the category candidates, set categoryId to null.
- For an ordinary transaction, infer the best walletId from the merchant, purchase purpose, and wallet candidates even when the wallet name is not spoken.
- A service-name wallet that is semantically related to the purchase purpose is a better wallet suggestion than a generic cash, card, or bank wallet.
- Example: food spending can prefer wallet candidates associated with food, grocery, restaurant, or delivery services, such as names containing Eats, Swiggy, Zomato, DoorDash, Zepto, or similar service names.
- Prefer the default wallet only if no wallet candidate name is relevant to the spoken purchase context.
- Wallet and category choices are suggestions for user confirmation, not confirmed facts.
- For a transfer, fromWalletId and toWalletId must be different wallet candidate ids.
- Do not invent ids, amounts, wallet names, categories, or extra transactions.
- The server resolves date phrases separately, so do not put date text in the title.
- Keep title short and useful for a confirmation screen.

User currency: ${currency || "unknown"}
Default wallet id: ${defaultWalletId || "none"}
Wallet candidates: ${JSON.stringify(wallets)}
Category candidates: ${JSON.stringify(categories)}
Transcript: ${JSON.stringify(transcript)}
`.trim();

const createAiError = (message, cause) => {
  const error = new Error(message);
  error.statusCode = 503;
  error.cause = cause;
  return error;
};

const mapById = (items) =>
  new Map(items.map((item) => [item._id.toString(), item]));

const normalizeMatchText = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const transcriptMentionsName = (transcript, name) => {
  const normalizedTranscript = ` ${normalizeMatchText(transcript)} `;
  const normalizedName = normalizeMatchText(name);

  return normalizedName
    ? normalizedTranscript.includes(` ${normalizedName} `)
    : false;
};

const findSpokenCategory = (transcript, categories) =>
  categories.find((category) => transcriptMentionsName(transcript, category.name));

const CATEGORY_DOMAIN_RULES = [
  {
    transcriptTerms: [
      "food",
      "foods",
      "meal",
      "meals",
      "breakfast",
      "lunch",
      "dinner",
      "snack",
      "snacks",
      "restaurant",
      "restaurants",
      "grocery",
      "groceries",
      "eat",
      "eats",
    ],
    categoryTerms: [
      "food",
      "meal",
      "dining",
      "restaurant",
      "grocery",
      "groceries",
      "eat",
      "eats",
      "cafe",
      "drink",
      "beverage",
    ],
  },
  {
    transcriptTerms: ["rent", "lease"],
    categoryTerms: ["rent", "housing", "home"],
  },
  {
    transcriptTerms: ["fuel", "petrol", "gas", "gasoline", "diesel"],
    categoryTerms: ["fuel", "petrol", "gas", "vehicle", "car", "transport"],
  },
  {
    transcriptTerms: ["subscription", "membership"],
    categoryTerms: ["subscription", "membership"],
  },
];

const hasNormalizedTerm = (value, terms) => {
  const normalized = ` ${normalizeMatchText(value)} `;

  return terms.some((term) => normalized.includes(` ${term} `));
};

const inferredCategoryMatchesContext = (transcript, category) => {
  if (!category) {
    return false;
  }

  const matchedRule = CATEGORY_DOMAIN_RULES.find((rule) =>
    hasNormalizedTerm(transcript, rule.transcriptTerms),
  );

  return !matchedRule || hasNormalizedTerm(category.name, matchedRule.categoryTerms);
};

const requestStructuredDraft = async (context) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ollamaTimeoutMs());

  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.VOICE_LLM_MODEL || "qwen3:8b",
        stream: false,
        think: false,
        format: VOICE_DRAFT_SCHEMA,
        options: {
          temperature: 0,
        },
        messages: [
          {
            role: "system",
            content:
              "You extract structured wallet transaction drafts for a finance app.",
          },
          {
            role: "user",
            content: buildPrompt(context),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createAiError(`Voice model request failed with status ${response.status}`);
    }

    const body = await response.json();
    const content = body?.message?.content;

    if (typeof content !== "string") {
      throw createAiError("Voice model returned an empty draft");
    }

    return JSON.parse(content);
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    throw createAiError("Voice model is unavailable or returned invalid JSON", error);
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeAiDraft = ({
  aiDraft,
  transcript,
  wallets,
  categories,
  unavailableCategories,
  defaultWalletId,
  dateResolution,
}) => {
  const walletIds = idSet(wallets);
  const categoryIds = idSet(categories);
  const walletsById = mapById(wallets);
  const categoriesById = mapById(categories);
  const kind = Object.values(DRAFT_KIND).includes(aiDraft?.kind)
    ? aiDraft.kind
    : DRAFT_KIND.UNKNOWN;
  const transactionType = ["INCOME", "EXPENSE"].includes(aiDraft?.transactionType)
    ? aiDraft.transactionType
    : null;
  const amount = cleanAmount(aiDraft?.amount);
  const description = cleanString(aiDraft?.description, 500);
  const title =
    cleanString(aiDraft?.title, 150) || defaultTitle(kind, transactionType);
  const fallbackWalletId = cleanChoiceId(defaultWalletId, walletIds);
  const confidence = cleanConfidence(aiDraft?.confidence);
  const warnings = [];

  if (dateResolution.source === "REFERENCE_DATE") {
    warnings.push("No spoken date was detected; the draft uses the reference date.");
  }

  if (kind === DRAFT_KIND.TRANSFER) {
    const fromWalletId =
      cleanChoiceId(aiDraft?.fromWalletId, walletIds) || fallbackWalletId;
    const toWalletId = cleanChoiceId(aiDraft?.toWalletId, walletIds);
    const payload = {
      fromWalletId,
      fromWalletName: walletsById.get(fromWalletId)?.walletName || null,
      toWalletId,
      toWalletName: walletsById.get(toWalletId)?.walletName || null,
      amount,
      title,
      description,
      transferDate: dateResolution.value,
    };
    const missingFields = [];

    if (!fromWalletId) {
      missingFields.push("fromWalletId");
    }
    if (!toWalletId || toWalletId === fromWalletId) {
      missingFields.push("toWalletId");
    }
    if (!amount) {
      missingFields.push("amount");
    }

    return {
      draftType: DRAFT_KIND.TRANSFER,
      payload,
      missingFields,
      confidence,
      warnings,
    };
  }

  if (kind === DRAFT_KIND.TRANSACTION) {
    const spokenActiveCategory = findSpokenCategory(transcript, categories);
    const spokenUnavailableCategory = findSpokenCategory(
      transcript,
      unavailableCategories,
    );
    const modelCategoryId = cleanChoiceId(aiDraft?.categoryId, categoryIds);
    const modelCategory = categoriesById.get(modelCategoryId);
    const inferredCategoryId = inferredCategoryMatchesContext(
      transcript,
      modelCategory,
    )
      ? modelCategoryId
      : null;
    const selectedCategoryId = spokenUnavailableCategory
      ? null
      : spokenActiveCategory?._id.toString() ||
        inferredCategoryId;
    const selectedWalletId =
      cleanChoiceId(aiDraft?.walletId, walletIds) || fallbackWalletId;

    if (spokenUnavailableCategory) {
      warnings.push(
        `Spoken category "${spokenUnavailableCategory.name}" is not available.`,
      );
    } else if (modelCategoryId && !inferredCategoryId && !spokenActiveCategory) {
      warnings.push("No available category matched the spoken purchase context.");
    }

    const payload = {
      walletId: selectedWalletId,
      walletName: walletsById.get(selectedWalletId)?.walletName || null,
      categoryId: selectedCategoryId,
      categoryName: categoriesById.get(selectedCategoryId)?.name || null,
      type: transactionType,
      amount,
      title,
      description,
      transactionDate: dateResolution.value,
    };
    const missingFields = [];

    ["walletId", "categoryId", "type", "amount"].forEach((field) => {
      if (!payload[field]) {
        missingFields.push(field);
      }
    });

    return {
      draftType: DRAFT_KIND.TRANSACTION,
      payload,
      missingFields,
      confidence,
      warnings,
    };
  }

  return {
    draftType: DRAFT_KIND.UNKNOWN,
    payload: null,
    missingFields: [],
    confidence,
    warnings: [
      ...warnings,
      "The transcript did not resolve to one income, expense, or transfer action.",
    ],
  };
};

const generateVoiceTransactionDraft = async ({
  transcript,
  referenceDate,
  timezone,
  user,
  wallets,
  categories,
  unavailableCategories = [],
}) => {
  const parsedReferenceDate = parseReferenceDate(referenceDate);

  if (!parsedReferenceDate) {
    const error = new Error("Invalid referenceDate");
    error.statusCode = 400;
    throw error;
  }

  const walletChoices = wallets.map((wallet) => ({
    id: wallet._id.toString(),
    name: wallet.walletName,
    isDefault: wallet._id.toString() === user.defaultWalletId?.toString(),
  }));
  const categoryChoices = categories.map((category) => ({
    id: category._id.toString(),
    name: category.name,
  }));
  const defaultWalletId = user.defaultWalletId?.toString() || null;
  const dateResolution = resolveDateFromTranscript({
    transcript,
    referenceDate: parsedReferenceDate,
    timezone,
  });
  const aiDraft = await requestStructuredDraft({
    transcript,
    wallets: walletChoices,
    categories: categoryChoices,
    defaultWalletId,
    currency: user.currency,
  });

  return {
    transcript,
    dateResolution,
    ...normalizeAiDraft({
      aiDraft,
      transcript,
      wallets,
      categories,
      unavailableCategories,
      defaultWalletId,
      dateResolution,
    }),
  };
};

module.exports = {
  generateVoiceTransactionDraft,
};
