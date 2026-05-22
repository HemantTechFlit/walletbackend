const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const requireOnboarding = require("../middlewares/requireOnboarding");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

const router = express.Router();

router.get("/", authMiddleware, requireOnboarding, listCategories);
router.post("/", authMiddleware, requireOnboarding, createCategory);
router.patch("/:id", authMiddleware, requireOnboarding, updateCategory);
router.delete("/:id", authMiddleware, requireOnboarding, deleteCategory);

module.exports = router;
