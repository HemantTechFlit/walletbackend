const multer = require("multer");

const { errorResponse } = require("../utils/responseHandler");

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
  limits: { fileSize: 10 * 1024 * 1024 },
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
      return errorResponse(res, err.message, 400);
    }
    next();
  });
};

module.exports = optionalReceiptUpload;
