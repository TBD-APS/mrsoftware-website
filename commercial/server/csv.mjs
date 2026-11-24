// CSV for Danish Excel: UTF-8 with a byte-order mark, semicolons, CRLF line ends.
// Formula guard: a spreadsheet may read a cell, or a piece of it after a line break or a comma
// (when it splits on commas), as a formula. An apostrophe goes before =, +, @ or a "-" that is
// not a list bullet at each of those starts, and before a tab or carriage return at the very
// start, so the value is shown as text.
const bom = '\uFEFF';
const controlStart = /^[\t\r]/;
const formulaStart = /(^|[\r\n,])([ "]*)(?=[=+@]|-(?=\S))/g;

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (controlStart.test(text)) text = "'" + text;
  text = text.replace(formulaStart, "$1$2'");
  return /[;"\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(column => cell(column.header)).join(';'), ...rows.map(row => columns.map(column => cell(column.value(row))).join(';'))];
  return bom + lines.map(line => line + '\r\n').join('');
}
