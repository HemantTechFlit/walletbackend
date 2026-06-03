const multer = require("multer");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/jpg",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new Error("Only JPEG, JPG, PNG, WebP, and GIF images are allowed"),
      );
    }
    cb(null, true);
  },
});

const uploadProfileImage = upload.single("profileImage");

module.exports = uploadProfileImage;
