const LegalDocument = require("../models/LegalDocument");

const LEGAL_DOCUMENT_TYPES = ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"];

const ensureLegalDocumentsSeeded = async () => {
  for (const type of LEGAL_DOCUMENT_TYPES) {
    const existing = await LegalDocument.findOne({ type }).lean();
    if (!existing) {
      await LegalDocument.create({ type, contentHtml: "" });
    }
  }
};

module.exports = {
  ensureLegalDocumentsSeeded,
  LEGAL_DOCUMENT_TYPES,
};
