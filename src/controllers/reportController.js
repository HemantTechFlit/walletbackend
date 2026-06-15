const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const Report = require("../models/Report");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const TransactionCategory = require("../models/TransactionCategory");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertCanCreateReport } = require("../utils/planLimits");
const { buildReportJson } = require("../utils/reportExport");

const STORAGE_DIR = path.join(__dirname, "..", "..", "storage", "reports");

const SUPPORTED_REPORT_TYPES = ["CSV", "PDF", "RECEIPTS_CSV"];
const SUPPORTED_TRANSACTION_TYPES = ["INCOME", "EXPENSE"];

const normalizeReportType = (value) => String(value || "CSV").trim().toUpperCase();

const normalizeTransactionType = (value) =>
  String(value || "").trim().toUpperCase();

const applyTransactionFilters = (txFilter, filters) => {
  const transactionType = filters.transactionType ?? filters.type;

  if (transactionType !== undefined) {
    const normalizedType = normalizeTransactionType(transactionType);
    if (!SUPPORTED_TRANSACTION_TYPES.includes(normalizedType)) {
      const err = new Error("filters.transactionType must be income or expense");
      err.statusCode = 400;
      throw err;
    }
    txFilter.type = normalizedType;
  }

  if (filters.categoryId !== undefined) {
    if (!mongoose.isValidObjectId(filters.categoryId)) {
      const err = new Error("filters.categoryId must be a valid category id");
      err.statusCode = 400;
      throw err;
    }
    txFilter.categoryId = filters.categoryId;
  }
};

const enrichReportMeta = async (userId, { walletIds = [], filters = {} }) => {
  const categoryId = filters?.categoryId;

  const [wallets, category] = await Promise.all([
    walletIds.length > 0
      ? Wallet.find({
          _id: { $in: walletIds },
          userId,
          isDeleted: false,
        })
          .select("walletName")
          .lean()
      : [],
    categoryId && mongoose.isValidObjectId(categoryId)
      ? TransactionCategory.findOne({
          _id: categoryId,
          userId,
          isDeleted: false,
        })
          .select("name")
          .lean()
      : null,
  ]);

  const walletById = new Map(wallets.map((wallet) => [wallet._id.toString(), wallet]));

  return {
    wallets: walletIds.map((walletId) => ({
      walletId: String(walletId),
      walletName: walletById.get(String(walletId))?.walletName ?? null,
    })),
    category:
      categoryId && mongoose.isValidObjectId(categoryId)
        ? {
            categoryId: String(categoryId),
            categoryName: category?.name ?? null,
          }
        : null,
  };
};

const formatReportResponse = async (userId, report) => {
  const plain =
    typeof report.toObject === "function" ? report.toObject() : { ...report };
  const { wallets, category } = await enrichReportMeta(userId, {
    walletIds: plain.walletIds,
    filters: plain.filters,
  });

  return {
    ...plain,
    wallets,
    category,
  };
};

const createReport = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { walletIds = [], fromDate, toDate, reportType = "CSV", filters = {} } =
      req.body;

    const type = normalizeReportType(reportType);

    if (!SUPPORTED_REPORT_TYPES.includes(type)) {
      return errorResponse(
        res,
        "reportType must be CSV, PDF, or RECEIPTS_CSV",
        400,
      );
    }

    if (!fromDate || !toDate) {
      return errorResponse(res, "fromDate and toDate are required", 400);
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return errorResponse(res, "Invalid date range", 400);
    }
    to.setHours(23, 59, 59, 999);

    if (to < from) {
      return errorResponse(res, "toDate must be after fromDate", 400);
    }

    if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
      return errorResponse(res, "filters must be an object", 400);
    }

    if (!Array.isArray(walletIds)) {
      return errorResponse(res, "walletIds must be an array", 400);
    }

    for (const wid of walletIds) {
      if (!mongoose.isValidObjectId(wid)) {
        return errorResponse(res, "Invalid wallet id in walletIds", 400);
      }
    }

    if (walletIds.length > 0) {
      const count = await Wallet.countDocuments({
        _id: { $in: walletIds },
        userId,
        isDeleted: false,
      });
      if (count !== walletIds.length) {
        return errorResponse(res, "One or more wallets were not found", 404);
      }
    }

    await assertCanCreateReport(userId);

    const txFilter = {
      userId,
      isDeleted: false,
      transactionDate: { $gte: from, $lte: to },
    };

    if (walletIds.length > 0) {
      txFilter.walletId = { $in: walletIds };
    }

    applyTransactionFilters(txFilter, filters);

    const rows = await WalletTransaction.find(txFilter)
      .sort({ transactionDate: -1 })
      .lean();

    const reportData = buildReportJson(rows, {
      reportType: type,
      fromDate: from,
      toDate: to,
    });

    const report = await Report.create({
      userId,
      walletIds,
      reportType: type,
      fromDate: from,
      toDate: to,
      filters,
      reportData,
    });

    const responseData = await formatReportResponse(userId, {
      ...report.toObject(),
      reportData,
    });

    return successResponse(
      res,
      "Report generated successfully",
      responseData,
      201,
    );
  } catch (error) {
    const code = error.statusCode || 500;
    return errorResponse(res, error.message, code);
  }
};

const listReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { userId: req.user.userId };

    const [items, total] = await Promise.all([
      Report.find(filter).sort({ generatedAt: -1 }).skip(skip).limit(limit).lean(),
      Report.countDocuments(filter),
    ]);

    const enrichedItems = await Promise.all(
      items.map((item) => formatReportResponse(req.user.userId, item)),
    );

    return successResponse(res, "Reports fetched successfully", {
      items: enrichedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const downloadReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid report id", 400);
    }

    const report = await Report.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!report) {
      return errorResponse(res, "Report not found", 404);
    }

    if (report.reportData) {
      const responseData = await formatReportResponse(req.user.userId, report);
      return successResponse(res, "Report fetched successfully", {
        id: responseData._id,
        reportType: responseData.reportType,
        fromDate: responseData.fromDate,
        toDate: responseData.toDate,
        filters: responseData.filters,
        wallets: responseData.wallets,
        category: responseData.category,
        generatedAt: responseData.generatedAt,
        reportData: responseData.reportData,
      });
    }

    if (report.fileUrl?.startsWith("http")) {
      return res.redirect(report.fileUrl);
    }

    const fileName = path.basename(report.fileUrl);
    const absolutePath = path.join(STORAGE_DIR, fileName);

    try {
      await fsPromises.access(absolutePath);
    } catch {
      return errorResponse(res, "Report file is no longer available", 404);
    }

    const isPdf = report.reportType === "PDF";
    res.setHeader(
      "Content-Type",
      isPdf ? "application/pdf" : "text/csv",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${id}.${isPdf ? "pdf" : "csv"}"`,
    );

    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  listReports,
  createReport,
  downloadReport,
};
