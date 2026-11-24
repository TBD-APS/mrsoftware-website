// CSV for Danish Excel: UTF-8 with a byte-order mark, semicolons, CRLF line ends. A cell that
// Excel would run as a formula is prefixed with an apostrophe.
const formulaStart = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (formulaStart.test(text)) text = "'" + text;
  return /[;"\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(column => cell(column.header)).join(';'), ...rows.map(row => columns.map(column => cell(column.value(row))).join(';'))];
  return '﻿' + lines.map(line => line + '\r\n').join('');
}
