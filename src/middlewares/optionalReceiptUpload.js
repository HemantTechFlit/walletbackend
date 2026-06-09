const multer = require("multer");

const { errorResponse } = require("../utils/responseHandler");
const { RECEIPT_MAX_FILE_SIZE_BYTES } = require("../utils/receiptUpload");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Receipt must be a PDF or image file"));
    }
    cb(null, true);
  },
});

const uploadReceipt = upload.single("receipt");

const optionalReceiptUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  uploadReceipt(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Receipt must be 15 MB or smaller"
          : err.message;
      return errorResponse(res, message, 400);
    }
    next();
  });
};

module.exports = optionalReceiptUpload;
