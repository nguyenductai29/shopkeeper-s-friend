type ExcelCell = string | number | boolean | null | undefined;

type ExportColumn<T> = {
  header: string;
  value: keyof T | ((row: T) => ExcelCell);
};

function escapeHtml(value: ExcelCell) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1";
}

export function exportRowsToExcel<T>({
  filename,
  sheetName,
  columns,
  rows,
}: {
  filename: string;
  sheetName: string;
  columns: ExportColumn<T>[];
  rows: T[];
}) {
  const tableRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const rawValue = typeof column.value === "function" ? column.value(row) : row[column.value];
          return `<td>${escapeHtml(rawValue as ExcelCell)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headerRow = columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #bdbdbd; padding: 6px 8px; mso-number-format: "\\@"; }
    th { background: #f2f2f2; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <caption>${escapeHtml(safeSheetName(sheetName))}</caption>
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
