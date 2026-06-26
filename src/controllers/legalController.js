const LegalDocument = require("../models/LegalDocument");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const LEGAL_TYPES = new Set(["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"]);

const getLegalDocument = async (req, res) => {
  try {
    const { type } = req.params;

    if (!LEGAL_TYPES.has(type)) {
      return errorResponse(res, "Invalid legal document type", 400);
    }

    const document = await LegalDocument.findOne({
      type,
      isDeleted: false,
    }).lean();

    return successResponse(res, "Legal document fetched successfully", {
      type,
      contentHtml: document?.contentHtml ?? "",
      updatedAt: document?.updatedAt ?? null,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  getLegalDocument,
};
