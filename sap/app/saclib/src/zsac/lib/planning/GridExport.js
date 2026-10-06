/**
 * Export of a planning table to CSV (pure): what the planner sees, header rows included.
 *   GridExport.csv(rows)   rows = [[{ text, span }]]; a cell with span n fills n columns (its text on the first, the rest empty)
 * A cell that a spreadsheet would read as a formula gets a leading quote; the file starts with a byte order mark so Excel reads UTF-8.
 */
sap.ui.define([], function () {
  "use strict";

  function matrix(rows) {
    return rows.map((row) => {
      const out = [];
      row.forEach((c) => {
        out.push(c.text === undefined || c.text === null ? "" : String(c.text));
        for (let i = 1; i < (c.span || 1); i++) { out.push(""); }
      });
      return out;
    });
  }

  function csv(rows) {
    const cell = (v) => {
      let t = String(v);
      if (/^[=+@\t\r]/.test(t) || /^-(?!\d[\d.,]*%?$)/.test(t)) { t = "'" + t; }
      return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    return "﻿" + matrix(rows).map((r) => r.map(cell).join(",")).join("\r\n");
  }

  return { matrix, csv };
});
