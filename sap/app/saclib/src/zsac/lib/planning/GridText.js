/** Text form of a block of cells for Copy and Paste (pure): tab separated columns, one line per row, as spreadsheets exchange it. */
sap.ui.define([], function () {
  "use strict";

  /** [[1, undefined, 2.5]] -> "1\t\t2.5". Numbers are written plain (no thousands separator) so any spreadsheet reads them. */
  function format(matrix) {
    return matrix.map((row) => row.map((v) => (v === undefined || v === null ? "" : String(v))).join("\t")).join("\n");
  }

  function toNumber(cell) {
    let t = String(cell).trim().replace(/\s/g, "");
    if (!t) { return null; }
    let negative = false;
    if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }       // accounting style (1,234)
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) { t = t.replace(/\./g, "").replace(",", "."); }   // 1.234,56
    else { t = t.replace(/,(?=\d{3}(\D|$))/g, ""); }                                          // 1,234.56
    if (t.endsWith("%")) { return null; }
    const n = Number(t);
    if (!Number.isFinite(n)) { return NaN; }
    return negative ? -n : n;
  }

  /**
   * "1\t2\n3\t4" -> [[1, 2], [3, 4]]. An empty cell is null (left alone when pasting), text that is not a number is NaN (reported).
   */
  function parse(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1] === "") { lines.pop(); }
    return lines.map((line) => line.split("\t").map(toNumber));
  }

  return { format, parse, toNumber };
});
