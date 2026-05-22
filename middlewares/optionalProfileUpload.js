const { errorResponse } = require("../utils/responseHandler");
const uploadProfileImage = require("./uploadProfileImage");

const optionalProfileUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  uploadProfileImage(req, res, (err) => {
    if (err) {
      return errorResponse(res, err.message, 400);
    }
    next();
  });
};

module.exports = optionalProfileUpload;
