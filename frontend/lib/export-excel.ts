import type { ReportResponse } from "./types";

export async function exportReportToExcel(report: ReportResponse) {
  // Dynamic import so ExcelJS only loads when the user clicks Export.
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  const sheetName = report.kind === "EXPENSE" ? "Expenses" : "Income";
  const ws = wb.addWorksheet(sheetName);

  // Title block.
  ws.getCell("A1").value = `${sheetName} Report`;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.mergeCells("A1:C1");
  ws.getCell("A2").value = `${report.from} to ${report.to}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  ws.mergeCells("A2:C2");

  // Header row.
  const tableStartRow = 4;
  ws.getRow(tableStartRow).values = ["Category", "Subcategory", "Total"];
  ws.getRow(tableStartRow).font = { bold: true };
  ws.getRow(tableStartRow).border = { bottom: { style: "thin" } };

  let r = tableStartRow + 1;
  for (const p of report.parents) {
    ws.getRow(r).values = [p.name, "", Number(p.total)];
    ws.getRow(r).font = { bold: true };
    r++;
    for (const c of p.children) {
      ws.getRow(r).values = ["", c.name, Number(c.total)];
      r++;
    }
  }

  if (Number(report.uncategorised) > 0) {
    ws.getRow(r).values = ["Uncategorised", "", Number(report.uncategorised)];
    ws.getRow(r).font = { italic: true, color: { argb: "FF888888" } };
    r++;
  }

  // Total footer.
  ws.getRow(r).values = ["Total", "", Number(report.grandTotal)];
  ws.getRow(r).font = { bold: true };
  ws.getRow(r).border = { top: { style: "thin" } };

  // Formatting.
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 16;
  ws.getColumn(3).numFmt = '"$"#,##0.00';

  const out = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${report.kind.toLowerCase()}-report-${report.from}-to-${report.to}.xlsx`,
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
