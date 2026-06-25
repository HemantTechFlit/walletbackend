const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const AdminSession = require("../models/AdminSession");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/generateTokens");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const buildAdminPayload = (admin) => ({
  id: admin._id,
  username: admin.username,
  name: admin.name,
  lastLoginAt: admin.lastLoginAt,
});

const createAdminSession = async ({ admin, req }) => {
  admin.lastLoginAt = new Date();
  await admin.save();

  const payload = {
    adminId: admin._id,
    username: admin.username,
    role: "admin",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await AdminSession.create({
    adminId: admin._id,
    refreshToken,
    deviceInfo: {
      userAgent: req.headers["user-agent"],
    },
    ipAddress: req.ip,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken,
    admin: buildAdminPayload(admin),
  };
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return errorResponse(res, "Username and password are required", 400);
    }

    const admin = await Admin.findOne({
      username: username.trim().toLowerCase(),
      isDeleted: false,
      status: "ACTIVE",
    }).select("+passwordHash");

    if (!admin) {
      return errorResponse(res, "Invalid username or password", 401);
    }

    const isPasswordMatched = await bcrypt.compare(password, admin.passwordHash);

    if (!isPasswordMatched) {
      return errorResponse(res, "Invalid username or password", 401);
    }

    const data = await createAdminSession({ admin, req });

    return successResponse(res, "Login successful", data);
  } catch (error) {
    console.log(error);
    return errorResponse(res, error.message);
  }
};

const me = async (req, res) => {
  try {
    const admin = await Admin.findOne({
      _id: req.admin.adminId,
      isDeleted: false,
      status: "ACTIVE",
    });

    if (!admin) {
      return errorResponse(res, "Admin not found", 404);
    }

    return successResponse(res, "Admin profile fetched", {
      admin: buildAdminPayload(admin),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return errorResponse(res, "Refresh token is required", 400);
    }

    const existingSession = await AdminSession.findOne({
      refreshToken: token,
    });

    if (!existingSession) {
      return errorResponse(res, "Invalid refresh token", 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    if (decoded.role !== "admin" || !decoded.adminId) {
      return errorResponse(res, "Invalid refresh token", 401);
    }

    const accessToken = generateAccessToken({
      adminId: decoded.adminId,
      username: decoded.username,
      role: "admin",
    });

    return successResponse(res, "Token refreshed successfully", {
      accessToken,
    });
  } catch (error) {
    return errorResponse(res, error.message, 401);
  }
};

const logout = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (token) {
      await AdminSession.deleteOne({ refreshToken: token });
    }

    return successResponse(res, "Logout successful");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  login,
  me,
  refreshToken,
  logout,
};
