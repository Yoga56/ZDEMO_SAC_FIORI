/** RFC 4180 style CSV reader (quotes, embedded commas and newlines); the delimiter is a comma, a semicolon or a tab, whichever the header line uses most. */
sap.ui.define([], function () {
  "use strict";

  function delimiterOf(text) {
    const head = String(text).split(/\r?\n/, 1)[0] || "";
    const count = (c) => head.split(c).length - 1;
    const best = [",", ";", "\t"].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : ",";
  }

  /** @returns {string[][]} rows of cells, empty lines left out */
  function parse(text, delimiter) {
    text = String(text || "").replace(/^﻿/, "");
    const d = delimiter || delimiterOf(text);
    const rows = [];
    let row = []; let cell = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') { q = false; } else { cell += c; }
      } else if (c === '"') { q = true; }
      else if (c === d) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") { i++; } row.push(cell); cell = ""; if (row.some((x) => x !== "")) { rows.push(row); } row = []; }
      else { cell += c; }
    }
    row.push(cell);
    if (row.some((x) => x !== "")) { rows.push(row); }
    return rows;
  }

  return { parse, delimiterOf };
});
