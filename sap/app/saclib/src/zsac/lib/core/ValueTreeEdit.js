/**
 * Edits of a value driver tree for the visual editor (pure). A node is addressed by its path: the indexes from the top node
 * ([] is the top node, [1, 0] the first driver of the second driver). Every edit keeps the tree valid: a parent always has drivers,
 * a ratio has two, and a node whose last driver is taken away becomes a data node. The functions change the tree they are given.
 *
 *   ValueTreeEdit.create(label) -> tree          a new tree: a sum of two data nodes
 *   ValueTreeEdit.leaf(label) -> node
 *   ValueTreeEdit.at(tree, path) -> node | null
 *   ValueTreeEdit.addChild(tree, path, label) -> new node
 *   ValueTreeEdit.remove(tree, path) -> boolean  (the top node cannot be removed)
 *   ValueTreeEdit.move(tree, path, delta) -> new path | null    -1 up, +1 down among the siblings
 *   ValueTreeEdit.setOp(tree, path, op)          op: sum | diff | product | ratio | leaf
 *   ValueTreeEdit.problems(tree) -> [text]       what the widget would complain about
 */
sap.ui.define([], function () {
  "use strict";

  const leaf = (label) => ({ label: label || "Driver", op: "leaf", filters: {}, measure: "", scale: 1, lower: null, range: null, pct: null, dist: "", children: [] });
  const at = (tree, path) => path.reduce((n, i) => (n && n.children[i]) || null, tree);

  function create(label) {
    return Object.assign(leaf(label || "Total"), { op: "sum", children: [leaf("Driver 1"), leaf("Driver 2")] });
  }

  function addChild(tree, path, label) {
    const n = at(tree, path);
    if (!n || n.op === "leaf") { return null; }
    const c = leaf(label || "Driver " + (n.children.length + 1));
    n.children.push(c);
    return c;
  }

  function remove(tree, path) {
    if (!path.length) { return false; }
    const parent = at(tree, path.slice(0, -1));
    if (!parent || !parent.children[path[path.length - 1]]) { return false; }
    parent.children.splice(path[path.length - 1], 1);
    if (!parent.children.length) { parent.op = "leaf"; }
    return true;
  }

  function move(tree, path, delta) {
    if (!path.length) { return null; }
    const parent = at(tree, path.slice(0, -1));
    const i = path[path.length - 1];
    const j = i + delta;
    if (!parent || j < 0 || j >= parent.children.length) { return null; }
    const t = parent.children[i]; parent.children[i] = parent.children[j]; parent.children[j] = t;
    return path.slice(0, -1).concat(j);
  }

  function setOp(tree, path, op) {
    const n = at(tree, path);
    if (!n) { return; }
    if (op === "leaf") { n.op = "leaf"; n.children = []; return; }
    n.op = op;
    // the data of a node that becomes a parent moves into its first driver, so nothing typed is lost
    if (!n.children.length) {
      const first = Object.assign(leaf("Driver 1"), { filters: n.filters, measure: n.measure, scale: n.scale, lower: n.lower, range: n.range, pct: n.pct, dist: n.dist });
      n.filters = {}; n.measure = ""; n.scale = 1; n.lower = null; n.range = null; n.pct = null; n.dist = "";
      n.children.push(first);
    }
    while (op === "ratio" && n.children.length < 2) { n.children.push(leaf("Driver " + (n.children.length + 1))); }
  }

  function problems(tree) {
    const out = [];
    (function walk(n) {
      if (n.op === "ratio" && n.children.length !== 2) { out.push("'" + n.label + "' is a ratio and needs exactly two drivers"); }
      if (n.op === "leaf" && n.range && n.range.min > n.range.max) { out.push("'" + n.label + "': the range starts above its end"); }
      n.children.forEach(walk);
    })(tree);
    return out;
  }

  return { create, leaf, at, addChild, remove, move, setOp, problems };
});
