const express = require("express");

const router = express.Router();
const { getLegalDocument } = require("../controllers/legalController");

router.get("/:type", getLegalDocument);

module.exports = router;
