const PDFDocument = require("pdfkit");

const escapeCsv = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const buildCsv = (rows) => {
  const header = [
    "id",
    "walletId",
    "categoryId",
    "type",
    "amount",
    "title",
    "description",
    "transactionDate",
    "receiptUrl",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row._id),
        escapeCsv(row.walletId),
        escapeCsv(row.categoryId),
        escapeCsv(row.type),
        escapeCsv(row.amount),
        escapeCsv(row.title),
        escapeCsv(row.description),
        escapeCsv(row.transactionDate?.toISOString?.() ?? row.transactionDate),
        escapeCsv(row.receipt?.fileUrl),
      ].join(","),
    );
  }
  return lines.join("\n");
};

const buildReceiptsCsv = (rows) => {
  const header = [
    "transactionId",
    "walletId",
    "categoryId",
    "type",
    "amount",
    "title",
    "transactionDate",
    "receiptFileName",
    "receiptFileType",
    "receiptUrl",
  ];
  const lines = [header.join(",")];

  for (const row of rows) {
    if (!row.receipt?.fileUrl) {
      continue;
    }

    lines.push(
      [
        escapeCsv(row._id),
        escapeCsv(row.walletId),
        escapeCsv(row.categoryId),
        escapeCsv(row.type),
        escapeCsv(row.amount),
        escapeCsv(row.title),
        escapeCsv(row.transactionDate?.toISOString?.() ?? row.transactionDate),
        escapeCsv(row.receipt.originalName),
        escapeCsv(row.receipt.fileType),
        escapeCsv(row.receipt.fileUrl),
      ].join(","),
    );
  }

  return lines.join("\n");
};

const buildPdfBuffer = (rows, { fromDate, toDate }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Transaction Report", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor("#444444")
      .text(
        `Period: ${fromDate.toISOString().slice(0, 10)} — ${toDate.toISOString().slice(0, 10)}`,
        { align: "center" },
      );
    doc.moveDown(1);
    doc.fillColor("#000000");

    if (rows.length === 0) {
      doc.fontSize(11).text("No transactions found for this period.");
      doc.end();
      return;
    }

    const colWidths = [62, 58, 55, 100, 85, 85, 330];
    const headers = [
      "Date",
      "Type",
      "Amount",
      "Title",
      "Wallet",
      "Category",
      "Receipt",
    ];
    const startX = 30;
    const bottomY = doc.page.height - 30;

    const getX = (index) =>
      startX + colWidths.slice(0, index).reduce((a, b) => a + b, 0);

    const drawHeader = () => {
      const headerY = doc.y;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
      headers.forEach((label, i) => {
        doc.text(label, getX(i), headerY, {
          width: colWidths[i],
          continued: false,
        });
      });
      return headerY + 16;
    };

    let y = drawHeader();

    for (const row of rows) {
      const dateStr =
        row.transactionDate?.toISOString?.().slice(0, 10) ??
        String(row.transactionDate ?? "");
      const cells = [
        dateStr,
        row.type ?? "",
        String(row.amount ?? ""),
        (row.title ?? "").slice(0, 28),
        row.walletSnapshot?.walletName ?? "",
        row.categorySnapshot?.name ?? "",
        row.receipt?.fileUrl ?? "",
      ];

      doc.font("Helvetica").fontSize(7);
      const rowHeight =
        Math.max(
          ...cells.map((cell, i) =>
            doc.heightOfString(String(cell), {
              width: colWidths[i],
            }),
          ),
          10,
        ) + 6;

      if (y + rowHeight > bottomY) {
        doc.addPage();
        y = drawHeader();
      }

      cells.forEach((cell, i) => {
        const x = getX(i);
        const options = { width: colWidths[i], continued: false };
        if (i === 6 && row.receipt?.fileUrl) {
          doc
            .fillColor("#1a5fb4")
            .fontSize(6.5)
            .text(String(cell), x, y, { ...options, link: row.receipt.fileUrl })
            .fillColor("#000000");
          return;
        }
        doc.fontSize(7);
        doc.text(String(cell), x, y, options);
      });

      y += rowHeight;
    }

    doc.end();
  });

const toIsoDate = (value) =>
  value?.toISOString?.() ?? (value ? String(value) : null);

const buildTransactionRowJson = (row) => ({
  id: String(row._id),
  walletId: row.walletId ? String(row.walletId) : null,
  categoryId: row.categoryId ? String(row.categoryId) : null,
  type: row.type ?? null,
  amount: row.amount ?? null,
  title: row.title ?? null,
  description: row.description ?? null,
  transactionDate: toIsoDate(row.transactionDate),
  walletName: row.walletSnapshot?.walletName ?? null,
  categoryName: row.categorySnapshot?.name ?? null,
  receiptUrl: row.receipt?.fileUrl ?? null,
  receiptFileName: row.receipt?.originalName ?? null,
  receiptFileType: row.receipt?.fileType ?? null,
});

const buildReportJson = (rows, { reportType, fromDate, toDate }) => {
  const base = {
    reportType,
    fromDate: toIsoDate(fromDate),
    toDate: toIsoDate(toDate),
  };

  if (reportType === "RECEIPTS_CSV") {
    return {
      ...base,
      headers: [
        "transactionId",
        "walletId",
        "walletName",
        "categoryId",
        "categoryName",
        "type",
        "amount",
        "title",
        "transactionDate",
        "receiptFileName",
        "receiptFileType",
        "receiptUrl",
      ],
      rows: rows
        .filter((row) => row.receipt?.fileUrl)
        .map((row) => ({
          transactionId: String(row._id),
          walletId: row.walletId ? String(row.walletId) : null,
          walletName: row.walletSnapshot?.walletName ?? null,
          categoryId: row.categoryId ? String(row.categoryId) : null,
          categoryName: row.categorySnapshot?.name ?? null,
          type: row.type ?? null,
          amount: row.amount ?? null,
          title: row.title ?? null,
          transactionDate: toIsoDate(row.transactionDate),
          receiptFileName: row.receipt?.originalName ?? null,
          receiptFileType: row.receipt?.fileType ?? null,
          receiptUrl: row.receipt?.fileUrl ?? null,
        })),
    };
  }

  return {
    ...base,
    headers: [
      "id",
      "walletId",
      "walletName",
      "categoryId",
      "categoryName",
      "type",
      "amount",
      "title",
      "description",
      "transactionDate",
      "receiptUrl",
    ],
    rows: rows.map(buildTransactionRowJson),
  };
};

module.exports = {
  buildCsv,
  buildReceiptsCsv,
  buildPdfBuffer,
  buildReportJson,
};
