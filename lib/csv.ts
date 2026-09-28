export function csvCell(value: unknown) {
  if (value == null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvText(headers: string[], rows: unknown[][]) {
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
