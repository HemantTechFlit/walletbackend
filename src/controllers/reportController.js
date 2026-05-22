const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const Report = require("../models/Report");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const { assertCanCreateReport } = require("../utils/planLimits");
const { buildCsv, buildPdfBuffer } = require("../utils/reportExport");
const { uploadReportToDrive } = require("../utils/googleDrive");

const STORAGE_DIR = path.join(__dirname, "..", "..", "storage", "reports");

const SUPPORTED_REPORT_TYPES = ["CSV", "PDF"];

const normalizeReportType = (value) => String(value || "CSV").trim().toUpperCase();

const createReport = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { walletIds = [], fromDate, toDate, reportType = "CSV", filters = {} } =
      req.body;

    const type = normalizeReportType(reportType);

    if (!SUPPORTED_REPORT_TYPES.includes(type)) {
      return errorResponse(
        res,
        "reportType must be CSV or PDF",
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

    if (to < from) {
      return errorResponse(res, "toDate must be after fromDate", 400);
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

    const rows = await WalletTransaction.find(txFilter)
      .sort({ transactionDate: -1 })
      .lean();

    let buffer;
    let mimeType;
    let extension;

    if (type === "PDF") {
      buffer = await buildPdfBuffer(rows, { fromDate: from, toDate: to });
      mimeType = "application/pdf";
      extension = "pdf";
    } else {
      buffer = Buffer.from(buildCsv(rows), "utf8");
      mimeType = "text/csv";
      extension = "csv";
    }

    const fileName = `report-${userId}-${Date.now()}.${extension}`;
    const fileUrl = await uploadReportToDrive({
      buffer,
      mimeType,
      fileName,
    });

    const report = await Report.create({
      userId,
      walletIds,
      reportType: type,
      fromDate: from,
      toDate: to,
      filters,
      fileUrl,
    });

    return successResponse(res, "Report generated successfully", report, 201);
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

    return successResponse(res, "Reports fetched successfully", {
      items,
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
