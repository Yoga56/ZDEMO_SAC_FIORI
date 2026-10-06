const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const Bookmarks = req("zsac/lib/core/Bookmarks");
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: m }; };

test("save, replace by name, rename, default, remove", () => {
  const st = memory();
  const b = Bookmarks.open(st, "bm", "alice");
  const a = b.save("Q2 view", { model: "M", view: { scale: 1000 } });
  assert.strictEqual(b.list().length, 1);
  const again = b.save("q2 VIEW", { model: "M", view: { scale: 1 } });        // the same name (any case) replaces
  assert.strictEqual(again.Id, a.Id);
  assert.strictEqual(b.list()[0].State.view.scale, 1);
  const other = b.save("Costs", { model: "OPEX" });
  b.setDefault(other.Id);
  assert.strictEqual(b.defaultOne().Name, "Costs");
  b.setDefault(a.Id);
  assert.strictEqual(b.list().filter((x) => x.Default).length, 1);
  assert.strictEqual(b.defaultOne().Id, a.Id);
  b.rename(other.Id, "Opex");
  assert.throws(() => b.rename(other.Id, "q2 view"), /exists/);
  assert.throws(() => b.save("  ", {}), /name/);
  b.remove(a.Id);
  assert.strictEqual(b.defaultOne(), null);
  assert.deepStrictEqual(b.list().map((x) => x.Name), ["Opex"]);
});

test("bookmarks are kept per user and survive a new session; rubbish and a failing storage give an empty list", () => {
  const st = memory();
  Bookmarks.open(st, "bm", "alice").save("Mine", { x: 1 });
  assert.strictEqual(Bookmarks.open(st, "bm", "ALICE").list().length, 1);
  assert.strictEqual(Bookmarks.open(st, "bm", "bob").list().length, 0);
  st.raw.set("bm.CAROL", "{not json");
  assert.deepStrictEqual(Bookmarks.open(st, "bm", "carol").list(), []);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const b = Bookmarks.open(broken, "bm", "x");
  assert.deepStrictEqual(b.list(), []);
  b.save("Still works this session", {});
  assert.strictEqual(b.list().length, 1);
});
