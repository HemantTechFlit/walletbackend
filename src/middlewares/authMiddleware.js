const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
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
    const user = await User.findOne({
      _id: decoded.userId,
      isDeleted: false,
      status: "ACTIVE",
    }).select("_id");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = authMiddleware;
