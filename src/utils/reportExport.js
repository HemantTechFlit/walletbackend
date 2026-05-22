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
      ].join(","),
    );
  }
  return lines.join("\n");
};

const buildPdfBuffer = (rows, { fromDate, toDate }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
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

    const colWidths = [70, 55, 55, 50, 120, 80];
    const headers = ["Date", "Type", "Amount", "Title", "Wallet", "Category"];
    let y = doc.y;

    doc.font("Helvetica-Bold").fontSize(9);
    headers.forEach((label, i) => {
      const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(label, x, y, { width: colWidths[i], continued: false });
    });

    y += 16;
    doc.font("Helvetica").fontSize(8);

    for (const row of rows) {
      if (y > 750) {
        doc.addPage();
        y = 40;
      }

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
      ];

      cells.forEach((cell, i) => {
        const x = 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(String(cell), x, y, { width: colWidths[i], continued: false });
      });

      y += 14;
    }

    doc.end();
  });

module.exports = {
  buildCsv,
  buildPdfBuffer,
};
