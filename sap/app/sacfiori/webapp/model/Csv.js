sap.ui.define([], function () {
  "use strict";

  /** Small RFC 4180 style parser/writer (quotes, embedded commas and newlines). */
  function parse(text) {
    const rows = [];
    let row = []; let cell = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') { q = false; } else { cell += c; }
      } else if (c === '"') { q = true; }
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") { i++; } row.push(cell); cell = ""; if (row.some((x) => x !== "")) { rows.push(row); } row = []; }
      else { cell += c; }
    }
    row.push(cell);
    if (row.some((x) => x !== "")) { rows.push(row); }
    return rows;
  }

  function write(rows) {
    const q = (s) => (/[",\n\r]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    return rows.map((r) => r.map(q).join(",")).join("\n");
  }

  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pick() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,text/csv";
      input.onchange = () => {
        const f = input.files[0];
        if (!f) { resolve(null); return; }
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, text: String(r.result) });
        r.readAsText(f);
      };
      input.click();
    });
  }

  return { parse, write, download, pick };
});
