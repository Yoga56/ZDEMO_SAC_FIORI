const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const History = req("zsac/lib/core/History");

test("record, undo, redo; a new change drops what could be redone; same state is not recorded", () => {
  const h = History.create();
  h.reset({ n: 0 });
  assert.strictEqual(h.canUndo, false);
  assert.strictEqual(h.record({ n: 0 }), false);
  assert.strictEqual(h.record({ n: 1 }), true);
  assert.strictEqual(h.record({ n: 2 }), true);
  assert.deepStrictEqual(h.undo(), { n: 1 });
  assert.deepStrictEqual(h.undo(), { n: 0 });
  assert.strictEqual(h.undo(), undefined);
  assert.strictEqual(h.canRedo, true);
  assert.deepStrictEqual(h.redo(), { n: 1 });
  assert.strictEqual(h.record({ n: 9 }), true);
  assert.strictEqual(h.canRedo, false);
  assert.deepStrictEqual(h.undo(), { n: 1 });
});

test("snapshots are copies and the history is limited", () => {
  const h = History.create(3);
  const state = { list: [1] };
  h.reset(state);
  state.list.push(2);
  h.record(state);
  state.list.push(3);               // changing the object later does not change what was recorded
  assert.deepStrictEqual(h.undo(), { list: [1] });
  const g = History.create(3);
  g.reset(0);
  [1, 2, 3, 4, 5].forEach((n) => g.record(n));
  const seen = [];
  for (let s = g.undo(); s !== undefined; s = g.undo()) { seen.push(s); }
  assert.deepStrictEqual(seen, [4, 3, 2]);
});
