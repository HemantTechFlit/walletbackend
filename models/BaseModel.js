const mongoose = require("mongoose");

const baseSchema = {
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
};

module.exports = baseSchema;
