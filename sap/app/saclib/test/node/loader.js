// Minimal sap.ui.define / sap.ui.require shim so the pure modules of zsac.lib run under `node --test`.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../src");
const cache = new Map();
// a test may stand in for a UI5 module that is not part of this library: globalThis.__sapStubs = { "sap/ui/model/Filter": class {} }

function resolve(dep, from) {
  if (dep.startsWith(".")) { return path.resolve(path.dirname(from), dep) + ".js"; }
  return path.join(ROOT, dep + ".js");
}

function load(file) {
  if (cache.has(file)) { return cache.get(file); }
  let exported;
  globalThis.sap = globalThis.sap || {};
  globalThis.sap.ui = globalThis.sap.ui || {};
  globalThis.sap.ui.define = (deps, factory) => {
    if (typeof deps === "function") { factory = deps; deps = []; }
    exported = factory(...deps.map((d) => (globalThis.__sapStubs && Object.prototype.hasOwnProperty.call(globalThis.__sapStubs, d) ? globalThis.__sapStubs[d] : load(resolve(d, file)))));
  };
  const code = fs.readFileSync(file, "utf8");
  new Function(code).call(globalThis);
  cache.set(file, exported);
  return exported;
}

module.exports = (module) => load(path.join(ROOT, module + ".js"));
