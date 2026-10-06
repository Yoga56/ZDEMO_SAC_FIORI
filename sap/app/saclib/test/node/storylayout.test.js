const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const StorySchema = req("zsac/lib/core/StorySchema");
const w = (id, X, Y, W, H, Page = 1) => ({ Id: id, Page, X, Y, W, H });
const story = (...widgets) => ({ Widgets: widgets });
const at = (s, id) => s.Widgets.find((x) => x.Id === id);

test("dragging a widget up onto others: it keeps its place and the ones it lands on move down", () => {
  const s = story(w("A", 0, 0, 12, 3), w("B", 0, 3, 12, 3), w("C", 0, 6, 12, 3));
  const c = at(s, "C");
  c.Y = 1;                                       // dropped over the lower part of A
  assert.strictEqual(StorySchema.settle(s, c), true);
  assert.strictEqual(c.Y, 1);                    // the dragged widget did not bounce back down
  assert.strictEqual(at(s, "A").Y, 4);           // A, which it landed on, goes below it
  assert.strictEqual(at(s, "B").Y, 7);           // and pushes B
  const old = story(w("A", 0, 0, 12, 3), w("B", 0, 3, 12, 3), w("C", 0, 6, 12, 3));
  const c2 = at(old, "C"); c2.Y = 0;             // dropped exactly on the top row
  StorySchema.settle(old, c2);
  assert.deepStrictEqual(old.Widgets.map((x) => x.Id + x.Y).join(" "), "A3 B6 C0");
});

test("a pushed widget pushes the ones below it; widgets that are not in the way stay", () => {
  const s = story(w("A", 0, 0, 6, 2), w("B", 0, 2, 6, 2), w("C", 6, 0, 6, 2), w("D", 0, 10, 12, 2));
  const m = at(s, "D");
  m.X = 0; m.Y = 0; m.W = 6; m.H = 2;            // dropped on A's place
  StorySchema.settle(s, m);
  assert.strictEqual(m.Y, 0);
  assert.strictEqual(at(s, "A").Y, 2);           // A moved below the dropped widget
  assert.strictEqual(at(s, "B").Y, 4);           // and pushed B
  assert.strictEqual(at(s, "C").Y, 0);           // C is in another column: untouched
  const rects = s.Widgets;
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert.ok(!(a.X < b.X + b.W && a.X + a.W > b.X && a.Y < b.Y + b.H && a.Y + a.H > b.Y), a.Id + " overlaps " + b.Id)));
});

test("no overlap means nothing moves; other pages are left alone", () => {
  const s = story(w("A", 0, 0, 6, 2), w("B", 6, 0, 6, 2), w("P2", 0, 0, 12, 4, 2));
  const a = at(s, "A");
  a.Y = 5;
  assert.strictEqual(StorySchema.settle(s, a), false);
  const b = at(s, "B"); b.X = 0; b.Y = 5;        // onto A on the same page
  assert.strictEqual(StorySchema.settle(s, b), true);
  assert.strictEqual(b.Y, 5);
  assert.strictEqual(a.Y, 7);
  assert.strictEqual(at(s, "P2").Y, 0);
});

test("tidy up: widgets move up until something is in the way, gaps close, columns are independent", () => {
  const s = story(w("A", 0, 2, 6, 2), w("B", 6, 5, 6, 2), w("C", 0, 9, 12, 2), w("D", 0, 0, 3, 1, 2));
  assert.strictEqual(StorySchema.compact(s, 1), true);
  assert.deepStrictEqual(s.Widgets.map((x) => x.Id + x.Y).join(" "), "A0 B0 C2 D0");   // D is on another page: untouched
  assert.strictEqual(StorySchema.compact(s, 1), false);                                  // already tidy
});

test("resize from any edge or corner keeps the box in the grid and at its minimum size", () => {
  const st = { X: 4, Y: 3, W: 4, H: 3 };
  assert.deepStrictEqual(StorySchema.resizeBox(st, "e", 3, 0), { X: 4, Y: 3, W: 7, H: 3 });
  assert.deepStrictEqual(StorySchema.resizeBox(st, "e", 99, 0), { X: 4, Y: 3, W: 8, H: 3 });      // stops at the right edge of the grid
  assert.deepStrictEqual(StorySchema.resizeBox(st, "w", -2, 0), { X: 2, Y: 3, W: 6, H: 3 });      // the right side stays put
  assert.deepStrictEqual(StorySchema.resizeBox(st, "w", -99, 0), { X: 0, Y: 3, W: 8, H: 3 });
  assert.deepStrictEqual(StorySchema.resizeBox(st, "w", 99, 0, 2), { X: 6, Y: 3, W: 2, H: 3 });    // not smaller than the minimum
  assert.deepStrictEqual(StorySchema.resizeBox(st, "n", 0, -2), { X: 4, Y: 1, W: 4, H: 5 });      // the bottom stays put
  assert.deepStrictEqual(StorySchema.resizeBox(st, "n", 0, -99), { X: 4, Y: 0, W: 4, H: 6 });
  assert.deepStrictEqual(StorySchema.resizeBox(st, "nw", -1, -1), { X: 3, Y: 2, W: 5, H: 4 });
  assert.deepStrictEqual(StorySchema.resizeBox(st, "se", 1, 2), { X: 4, Y: 3, W: 5, H: 5 });
  assert.deepStrictEqual(StorySchema.resizeBox(st, "s", 0, -99), { X: 4, Y: 3, W: 4, H: 1 });
});
