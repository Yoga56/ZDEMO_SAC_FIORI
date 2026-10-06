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
