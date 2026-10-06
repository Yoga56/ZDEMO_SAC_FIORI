const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const VT = req("zsac/lib/core/ValueTree");

const TEXT = `
# profit tree
Profit | diff
  Revenue
    Cloud | leaf | PRODUCT=Cloud ERP; measure=REVENUE
    Services | leaf | PRODUCT=Services, Licences; measure=REVENUE
  Cost | leaf | measure=COST; scale=2; good=down
`;

test("value tree: parse gives ids, operators and leaf specs", () => {
  const { tree, errors } = VT.parse(TEXT);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(tree.op, "diff");
  assert.strictEqual(tree.children[0].op, "sum"); // a parent without operator sums
  assert.strictEqual(tree.children[0].children[1].id, "0.0.1");
  assert.deepStrictEqual(tree.children[0].children[1].filters, { PRODUCT: ["Services", "Licences"] });
  assert.strictEqual(tree.children[1].scale, 2);
  assert.deepStrictEqual(VT.leaves(tree).map((n) => n.id), ["0.0.0", "0.0.1", "0.1"]);
});

test("value tree: every problem is reported, the readable part is kept", () => {
  const { tree, errors } = VT.parse("Top | ratio\n  A | leaf\n  B | nope\n      Deep\n  C | leaf | X\nSecond top");
  assert.ok(tree);
  const text = errors.join("\n");
  assert.match(text, /unknown operator 'nope'/);
  assert.match(text, /indented too far/);
  assert.match(text, /not NAME=value/);
  assert.match(text, /only one top node/);
  assert.match(text, /ratio and needs exactly two children/);
  assert.deepStrictEqual(VT.parse("").errors, ["The tree is empty"]);
  assert.match(VT.parse("A | sum").errors.join(), /has no children/);
  assert.match(VT.parse("A | leaf\n  B | leaf").errors.join(), /is a leaf but has children/);
});

test("value tree: values flow up with every operator", () => {
  const { tree } = VT.parse("T | diff\n  P | product\n    Price | leaf\n    Qty | leaf\n  R | ratio\n    A | leaf\n    B | leaf");
  const v = VT.annotate(tree, { "0.0.0": 5, "0.0.1": 10, "0.1.0": 30, "0.1.1": 6 });
  assert.strictEqual(v.children[0].value, 50);
  assert.strictEqual(v.children[1].value, 5);
  assert.strictEqual(v.value, 45);
  const zero = VT.annotate(tree, { "0.0.0": 5, "0.0.1": 10, "0.1.0": 30, "0.1.1": 0 });
  assert.strictEqual(zero.value, null); // ratio by zero, and null spreads up instead of a wrong number
  assert.strictEqual(VT.annotate(tree, {}).value, null);
});

test("value tree: simulation changes a leaf and the effect reaches the top; base stays", () => {
  const { tree } = VT.parse(TEXT);
  const values = { "0.0.0": 600, "0.0.1": 400, "0.1": 300 }; // cost 300 with scale 2 = 150
  const plain = VT.annotate(tree, values);
  assert.strictEqual(plain.value, 850);
  const sim = VT.annotate(tree, values, { overrides: { "0.0.0": { pct: 10 } } });
  assert.strictEqual(sim.base, 850);
  assert.strictEqual(sim.value, 910);
  assert.strictEqual(sim.simulated, 60);
  assert.ok(Math.abs(sim.simulatedPct - 60 / 850 * 100) < 1e-9);
  assert.strictEqual(sim.children[0].children[0].value, 660);
  const abs = VT.annotate(tree, values, { overrides: { "0.1": { abs: 100 } } });
  assert.strictEqual(abs.value, 900);
  // an empty override is no override
  assert.strictEqual(VT.annotate(tree, values, { overrides: { "0.1": { pct: "" } } }).value, 850);
});

test("value tree: comparison gives delta, percent and which way is good", () => {
  const { tree } = VT.parse(TEXT);
  const values = { "0.0.0": 600, "0.0.1": 400, "0.1": 300 };
  const compare = { "0.0.0": 500, "0.0.1": 400, "0.1": 400 };
  const r = VT.annotate(tree, values, { compare });
  assert.strictEqual(r.compare, 700);
  assert.strictEqual(r.delta, 150);
  assert.strictEqual(r.favorable, true);
  const cost = r.children[1];
  assert.strictEqual(cost.delta, -50);
  assert.strictEqual(cost.favorable, true); // good=down: a fall of cost is favorable
});

test("value tree: good=down is checked and the widget default applies to nodes without it", () => {
  assert.match(VT.parse("A | leaf | good=sideways").errors.join(), /good must be up or down/);
  const { tree } = VT.parse("T | diff\n  A | leaf\n  B | leaf | good=up");
  const r = VT.annotate(tree, { "0.0": 10, "0.1": 5 }, { compare: { "0.0": 8, "0.1": 4 }, lowerIsBetter: true });
  assert.strictEqual(r.children[0].favorable, false); // A rose, widget says lower is better
  assert.strictEqual(r.children[1].favorable, true); // B says up is good
});

test("serialize writes a tree back as text that parses to the same tree", () => {
  const ValueTree = req("zsac/lib/core/ValueTree");
  const text = ["Profit | diff", "  Revenue | sum", "    Cloud | leaf | PRODUCT=Cloud ERP,Planning; measure=REVENUE; scale=1000; range=1..2.5; dist=uniform", "    Other | leaf | CHANNEL=Direct", "  Cost | sum",
    "    Direct | leaf | measure=COST; good=down; pct=10", "    Partner | leaf | good=up"].join("\n");
  const a = ValueTree.parse(text);
  assert.deepStrictEqual(a.errors, []);
  const out = ValueTree.serialize(a.tree);
  assert.strictEqual(out, text);
  const b = ValueTree.parse(out);
  const strip = (n) => ({ label: n.label, op: n.op, filters: n.filters, measure: n.measure, scale: n.scale, lower: n.lower, range: n.range, pct: n.pct, dist: n.dist, children: n.children.map(strip) });
  assert.deepStrictEqual(strip(b.tree), strip(a.tree));
});

test("tree edits keep the tree valid", () => {
  const Edit = req("zsac/lib/core/ValueTreeEdit");
  const t = Edit.create("Profit");
  assert.strictEqual(VT.serialize(t), "Profit | sum\n  Driver 1 | leaf\n  Driver 2 | leaf");
  Edit.at(t, [0]).filters = { REGION: ["EMEA"] };
  Edit.at(t, [0]).measure = "REVENUE";
  Edit.setOp(t, [0], "sum");                                     // a data node becomes a parent: its data moves into its first driver
  assert.strictEqual(Edit.at(t, [0]).children.length, 1);
  assert.deepStrictEqual(Edit.at(t, [0, 0]).filters, { REGION: ["EMEA"] });
  assert.strictEqual(Edit.at(t, [0]).measure, "");
  Edit.setOp(t, [1], "ratio");
  assert.strictEqual(Edit.at(t, [1]).children.length, 2);
  assert.strictEqual(Edit.problems(t).length, 0);
  assert.strictEqual(Edit.addChild(t, [1, 0], "x"), null);       // a data node has no drivers
  const c = Edit.addChild(t, [], "Third");
  assert.strictEqual(c.label, "Third");
  assert.strictEqual(Edit.problems(t).length, 0);
  assert.deepStrictEqual(Edit.move(t, [2], -1), [1]);
  assert.strictEqual(Edit.at(t, [1]).label, "Third");
  assert.strictEqual(Edit.move(t, [0], -1), null);
  Edit.addChild(t, [2], "third driver of the ratio");
  assert.strictEqual(Edit.problems(t).length, 1);
  assert.strictEqual(Edit.remove(t, []), false);
  // taking the last driver away makes the node a data node again
  assert.strictEqual(Edit.remove(t, [0, 0]), true);
  assert.strictEqual(Edit.at(t, [0]).op, "leaf");
  Edit.setOp(t, [2], "leaf");
  assert.strictEqual(Edit.at(t, [2]).children.length, 0);
  assert.deepStrictEqual(VT.parse(VT.serialize(t)).errors, []);
});
