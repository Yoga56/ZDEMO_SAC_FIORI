/**
 * Value driver tree (pure): a tree of nodes where a parent is computed from its children and the leaves read the data.
 * It answers "what drives this number" and, with a simulation, "what happens if this driver changes".
 *
 * The tree is written as indented lines, one node per line, two spaces (or a tab) per level:
 *
 *   Profit | diff
 *     Revenue | sum
 *       Cloud ERP | leaf | PRODUCT=Cloud ERP; measure=REVENUE
 *       Services | leaf | PRODUCT=Services
 *     Cost | leaf | measure=COST
 *
 * line = label [| operator [| spec]]
 *   operator  sum (default for a parent), diff (first child minus the others), product, ratio (first divided by second), leaf (default without children)
 *   spec      for a leaf: entries separated by ";", each DIMENSION=member1,member2 (a filter), measure=ID (the measure, default the widget's), scale=1000, good=down (a fall is favorable: costs)
 *
 *   ValueTree.parse(text) -> { tree, errors }
 *   ValueTree.leaves(tree) -> leaf nodes
 *   ValueTree.annotate(tree, values, options) -> tree with value, base, compare for every node
 *     values   { nodeId: number } the data of every leaf
 *     options  { compare: { nodeId: number }, overrides: { nodeId: { pct } | { abs } }, lowerIsBetter }
 *
 * node = { id, label, op, filters, measure, scale, children }, and after annotate also
 *   base       the value without the simulation
 *   value      the value with the simulation (equals base without overrides)
 *   simulated  the change the simulation causes (value - base)
 *   compare    the value of the comparison, delta / pct against it, favorable
 */
sap.ui.define([], function () {
  "use strict";

  const OPS = ["sum", "diff", "product", "ratio", "leaf"];
  const SYMBOL = { sum: "+", diff: "−", product: "×", ratio: "÷" };

  function parseSpec(spec, lineNo, errors) {
    const out = { filters: {}, measure: "", scale: 1, lower: null };
    String(spec || "").split(";").map((s) => s.trim()).filter(Boolean).forEach((entry) => {
      const i = entry.indexOf("=");
      if (i < 1) { errors.push("Line " + lineNo + ": '" + entry + "' is not NAME=value"); return; }
      const key = entry.slice(0, i).trim();
      const val = entry.slice(i + 1).trim();
      if (key.toLowerCase() === "measure") { out.measure = val; return; }
      if (key.toLowerCase() === "scale") {
        const n = Number(val);
        if (!isFinite(n) || n === 0) { errors.push("Line " + lineNo + ": scale must be a number other than 0"); } else { out.scale = n; }
        return;
      }
      if (key.toLowerCase() === "good") {
        if (val !== "up" && val !== "down") { errors.push("Line " + lineNo + ": good must be up or down"); } else { out.lower = val === "down"; }
        return;
      }
      out.filters[key.toUpperCase()] = val.split(",").map((s) => s.trim()).filter(Boolean);
    });
    return out;
  }

  /** Text to tree. Errors do not stop the parse: what is readable is returned, so the editor can show every problem at once. */
  function parse(text) {
    const errors = [];
    const lines = String(text || "").split("\n").map((raw, i) => ({ raw, no: i + 1 })).filter((l) => l.raw.trim() && !l.raw.trim().startsWith("#"));
    if (!lines.length) { return { tree: null, errors: ["The tree is empty"] }; }
    const stack = [];
    let root = null;
    lines.forEach((l) => {
      const lead = /^[ \t]*/.exec(l.raw)[0];
      const depth = lead.split("\t").length - 1 + Math.floor(lead.replace(/\t/g, "").length / 2);
      const parts = l.raw.trim().split("|").map((s) => s.trim());
      const label = parts[0];
      if (!label) { errors.push("Line " + l.no + ": a node needs a label"); return; }
      let op = (parts[1] || "").toLowerCase();
      if (op && OPS.indexOf(op) < 0) { errors.push("Line " + l.no + ": unknown operator '" + parts[1] + "' (use " + OPS.join(", ") + ")"); op = ""; }
      const spec = parseSpec(parts.slice(2).join("|"), l.no, errors);
      const node = { label, op, filters: spec.filters, measure: spec.measure, scale: spec.scale, lower: spec.lower, children: [] };
      if (depth === 0) {
        if (root) { errors.push("Line " + l.no + ": there can be only one top node"); return; }
        root = node; stack.length = 0; stack.push(node); node.id = "0"; return;
      }
      if (!root) { errors.push("Line " + l.no + ": the first line must be the top node, not indented"); return; }
      if (depth > stack.length) { errors.push("Line " + l.no + ": indented too far"); return; }
      stack.length = depth;
      const parent = stack[depth - 1];
      node.id = parent.id + "." + parent.children.length;
      parent.children.push(node);
      stack.push(node);
    });
    if (root) {
      (function finish(n) {
        n.children.forEach(finish);
        if (!n.op) { n.op = n.children.length ? "sum" : "leaf"; }
        if (n.op === "leaf" && n.children.length) { errors.push("'" + n.label + "' is a leaf but has children"); }
        if (n.op !== "leaf" && !n.children.length) { errors.push("'" + n.label + "' is " + n.op + " but has no children"); }
        if (n.op === "ratio" && n.children.length !== 2) { errors.push("'" + n.label + "' is a ratio and needs exactly two children"); }
      })(root);
    }
    return { tree: root, errors };
  }

  function leaves(tree) {
    const out = [];
    (function walk(n) { if (!n) { return; } if (n.op === "leaf") { out.push(n); } n.children.forEach(walk); })(tree);
    return out;
  }

  function combine(op, v) {
    if (v.some((x) => x === null)) { return null; }
    switch (op) {
      case "sum": return v.reduce((s, x) => s + x, 0);
      case "diff": return v.slice(1).reduce((s, x) => s - x, v[0]);
      case "product": return v.reduce((s, x) => s * x, 1);
      case "ratio": return v[1] === 0 ? null : v[0] / v[1];
      default: return null;
    }
  }

  function leafValue(node, values, overrides, simulate) {
    const raw = values[node.id];
    if (raw === undefined || raw === null) { return null; }
    const base = raw / node.scale;
    const o = simulate && overrides && overrides[node.id];
    if (!o) { return base; }
    if (o.abs !== undefined && o.abs !== null && o.abs !== "") { return Number(o.abs); }
    if (o.pct !== undefined && o.pct !== null && o.pct !== "") { return base * (1 + Number(o.pct) / 100); }
    return base;
  }

  /** Value of a node from the leaf values: simulate = apply the overrides. */
  function evaluate(node, values, overrides, simulate) {
    if (node.op === "leaf") { return leafValue(node, values, overrides, simulate); }
    return combine(node.op, node.children.map((c) => evaluate(c, values, overrides, simulate)));
  }

  function annotate(tree, values, options) {
    const opts = options || {};
    const copy = (n) => {
      const base = evaluate(n, values, opts.overrides, false);
      const value = evaluate(n, values, opts.overrides, true);
      const compare = opts.compare ? evaluate(n, opts.compare, null, false) : null;
      const out = Object.assign({}, n, { children: n.children.map(copy), base, value });
      out.simulated = value === null || base === null ? null : value - base;
      out.simulatedPct = out.simulated === null || !base ? null : out.simulated / Math.abs(base) * 100;
      out.compare = compare;
      if (opts.compare) {
        out.delta = value === null || compare === null ? null : value - compare;
        out.pct = out.delta === null || !compare ? null : out.delta / Math.abs(compare) * 100;
        out.favorable = !out.delta ? null : (out.delta > 0) !== (n.lower === null ? !!opts.lowerIsBetter : n.lower);
      }
      return out;
    };
    return copy(tree);
  }

  return { parse, leaves, annotate, evaluate, OPS, SYMBOL };
});
