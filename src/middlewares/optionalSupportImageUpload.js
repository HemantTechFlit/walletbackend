const multer = require("multer");

const { errorResponse } = require("../utils/responseHandler");

const SUPPORT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SUPPORT_IMAGE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error("Attachment must be an image file"));
    }
    cb(null, true);
  },
});

const uploadAttachment = upload.single("attachment");

const optionalSupportImageUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  uploadAttachment(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Attachment must be 3 MB or smaller"
          : err.message;
      return errorResponse(res, message, 400);
    }
    next();
  });
};

module.exports = {
  optionalSupportImageUpload,
  SUPPORT_IMAGE_MAX_BYTES,
};
