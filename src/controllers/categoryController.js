const mongoose = require("mongoose");

const User = require("../models/User");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const listCategories = async (req, res) => {
  try {
    const userId = req.user.userId;

    const categories = await TransactionCategory.find({
      userId,
      isDeleted: false,
    })
      .sort({ name: 1 })
      .lean();

    return successResponse(res, "Categories fetched successfully", categories);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    const userId = req.user.userId;

    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(res, "name is required", 400);
    }

    const trimmed = name.trim();

    const duplicate = await TransactionCategory.findOne({
      userId,
      name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      isDeleted: false,
    });

    if (duplicate) {
      return errorResponse(res, "Category with this name already exists", 400);
    }

    const payload = {
      userId,
      name: trimmed,
      isDefault: false,
    };

    if (color !== undefined) {
      payload.color = String(color).trim();
    }

    if (icon !== undefined) {
      payload.icon = String(icon).trim();
    }

    const category = await TransactionCategory.create(payload);

    await User.findByIdAndUpdate(userId, {
      $addToSet: { selectedCategories: category._id },
      $set: { updatedAt: new Date() },
    });

    return successResponse(res, "Category created successfully", category, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid category id", 400);
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(res, "name is required", 400);
    }

    const category = await TransactionCategory.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return errorResponse(res, "Category not found", 404);
    }

    category.name = name.trim();

    if (color !== undefined) {
      category.color = String(color).trim();
    }

    if (icon !== undefined) {
      category.icon = String(icon).trim();
    }

    category.updatedAt = new Date();
    await category.save();

    return successResponse(res, "Category updated successfully", category);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid category id", 400);
    }

    const category = await TransactionCategory.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return errorResponse(res, "Category not found", 404);
    }

    category.isDeleted = true;
    category.updatedAt = new Date();
    await category.save();

    await User.findByIdAndUpdate(userId, {
      $pull: { selectedCategories: category._id },
      $set: { updatedAt: new Date() },
    });

    return successResponse(res, "Category deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
