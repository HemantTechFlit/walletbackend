const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const extractedToken = token.split(" ")[1];
    const decoded = jwt.verify(extractedToken, process.env.JWT_ACCESS_SECRET);

    if (decoded.role !== "admin" || !decoded.adminId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const admin = await Admin.findOne({
      _id: decoded.adminId,
      isDeleted: false,
      status: "ACTIVE",
    }).select("_id");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = adminAuthMiddleware;
