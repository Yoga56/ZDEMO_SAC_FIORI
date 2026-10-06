const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const Resize = req("zsac/lib/core/Resize");

function memory() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; }

test("resize: a width stays within the limits and below 70% of the room", () => {
  assert.strictEqual(Resize.clamp(100, 200, 500), 200);
  assert.strictEqual(Resize.clamp(900, 200, 500), 500);
  assert.strictEqual(Resize.clamp(333.6, 200, 500), 334);
  assert.strictEqual(Resize.clamp(500, 200, 800, 600), 420); // 70% of 600
  assert.strictEqual(Resize.clamp(500, 200, 800, 100), 200); // a tiny container never goes below the minimum
  assert.strictEqual(Resize.clamp("abc", 200, 500), 200);
  assert.strictEqual(Resize.clamp(NaN, 200, 500, 1000), 200);
});

test("resize: keyboard steps", () => {
  assert.strictEqual(Resize.next(300, 1), 316);
  assert.strictEqual(Resize.next(300, -1), 284);
  assert.strictEqual(Resize.next(300, 1, 48), 348);
});

test("resize: remembered per panel, forgotten on reset, tolerant of bad or missing storage", () => {
  const s = memory();
  assert.strictEqual(Resize.read(s, "nav", 240), 240);
  Resize.write(s, "nav", 301.4); Resize.write(s, "right", 400);
  assert.strictEqual(Resize.read(s, "nav", 240), 301);
  assert.strictEqual(Resize.read(s, "right", 0), 400);
  Resize.clear(s, "nav");
  assert.strictEqual(Resize.read(s, "nav", 240), 240);
  assert.strictEqual(Resize.read(s, "right", 0), 400);
  s.setItem(Resize.STORE, "not json"); assert.strictEqual(Resize.read(s, "nav", 7), 7);
  s.setItem(Resize.STORE, "[1,2]"); assert.strictEqual(Resize.read(s, "nav", 7), 7);
  s.setItem(Resize.STORE, JSON.stringify({ nav: -5 })); assert.strictEqual(Resize.read(s, "nav", 7), 7);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.strictEqual(Resize.read(broken, "nav", 9), 9);
  assert.doesNotThrow(() => { Resize.write(broken, "nav", 100); Resize.clear(broken, "nav"); });
});
