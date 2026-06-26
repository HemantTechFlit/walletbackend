const LegalDocument = require("../models/LegalDocument");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const LEGAL_TYPES = new Set(["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"]);

const formatLegalDocument = (doc) => ({
  id: doc._id,
  type: doc.type,
  contentHtml: doc.contentHtml ?? "",
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy ?? null,
});

const listLegalDocuments = async (req, res) => {
  try {
    const documents = await LegalDocument.find({ isDeleted: false })
      .sort({ type: 1 })
      .lean();

    return successResponse(res, "Legal documents fetched successfully", {
      documents: documents.map(formatLegalDocument),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateLegalDocument = async (req, res) => {
  try {
    const { type } = req.params;
    const contentHtml = req.body.contentHtml;

    if (!LEGAL_TYPES.has(type)) {
      return errorResponse(res, "Invalid legal document type", 400);
    }

    if (typeof contentHtml !== "string") {
      return errorResponse(res, "contentHtml must be a string", 400);
    }

    const document = await LegalDocument.findOneAndUpdate(
      { type, isDeleted: false },
      {
        contentHtml,
        updatedBy: req.admin.adminId,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return successResponse(
      res,
      "Legal document updated successfully",
      formatLegalDocument(document),
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listLegalDocuments,
  updateLegalDocument,
};
