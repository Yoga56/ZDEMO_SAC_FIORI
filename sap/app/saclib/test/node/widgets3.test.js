const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const ButtonAction = req("zsac/lib/core/ButtonAction");
const Feed = req("zsac/lib/core/Feed");
const CommentThread = req("zsac/lib/core/CommentThread");

const story = { Pages: [{ Id: 1 }, { Id: 2 }] };

test("button action: only the listed actions with checked targets", () => {
  assert.deepStrictEqual(ButtonAction.resolve({ Action: "page", Page: 2 }, story), { ok: true, kind: "page", page: 2 });
  assert.match(ButtonAction.resolve({ Action: "page", Page: 7 }, story).error, /no page 7/);
  assert.match(ButtonAction.resolve({ Action: "page" }, story).error, /choose one/);
  assert.strictEqual(ButtonAction.resolve({ Action: "url", Url: "https://example.com/a" }, story).url, "https://example.com/a");
  assert.strictEqual(ButtonAction.resolve({ Action: "url", Url: "javascript:alert(1)" }, story).ok, false);
  assert.strictEqual(ButtonAction.resolve({ Action: "app", Route: "stories/STORY_SALES" }, story).hash, "#/stories/STORY_SALES");
  assert.strictEqual(ButtonAction.resolve({ Action: "app", Route: "#/planning" }, story).hash, "#/planning");
  ["//evil.example", "a b", "x?y=1", "..", "a/../b", "javascript:1"].forEach((r) => assert.strictEqual(ButtonAction.resolve({ Action: "app", Route: r }, story).ok, false, r));
  assert.strictEqual(ButtonAction.resolve({}, story).kind, "none");
  assert.strictEqual(ButtonAction.resolve({ Action: "refresh" }, story).ok, true);
  assert.strictEqual(ButtonAction.resolve({ Action: "format-disk" }, story).ok, false);
  assert.strictEqual(ButtonAction.isIcon("sap-icon://home"), true);
  assert.strictEqual(ButtonAction.isIcon("sap-icon://a b"), false);
  assert.strictEqual(ButtonAction.isIcon("https://x/y.png"), false);
});

test("feed: RSS items with CDATA, entities and dates; markup and scripts are removed", () => {
  const f = Feed.parse(Feed.SAMPLE, 10);
  assert.strictEqual(f.title, "Company news");
  assert.strictEqual(f.items.length, 3);
  assert.strictEqual(f.items[0].link, "https://example.com/news/q3-close");
  assert.strictEqual(f.items[0].date, "2026-10-05T08:00:00.000Z");
  assert.strictEqual(f.items[1].summary, "The price list changes from 1 January. See the planning guide.");
  assert.strictEqual(Feed.parse(Feed.SAMPLE, 2).items.length, 2);
  const nasty = '<rss><channel><title>T</title><item><title>A &amp; B &lt;script&gt;x&lt;/script&gt;</title><link>javascript:alert(1)</link><description>&lt;img src=x onerror=alert(1)&gt;Hello &lt;b&gt;you&lt;/b&gt;<script>alert(2)</script></description></item></channel></rss>';
  const n = Feed.parse(nasty, 5).items[0];
  assert.strictEqual(n.link, "");
  assert.ok(!/[<>]/.test(n.title + n.summary), n.title + "|" + n.summary);
  assert.strictEqual(n.summary, "Hello you");
});

test("feed: Atom entries with href links and updated dates; other documents are refused", () => {
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry><title>One</title><link rel="alternate" href="https://blog.example.com/1?a=1&amp;b=2"/><updated>2026-09-01T10:00:00Z</updated><summary>First post</summary></entry></feed>';
  const f = Feed.parse(atom, 5);
  assert.strictEqual(f.title, "Blog");
  assert.strictEqual(f.items[0].link, "https://blog.example.com/1?a=1&b=2");
  assert.strictEqual(f.items[0].date, "2026-09-01T10:00:00.000Z");
  assert.match(Feed.parse("<html><body>hi</body></html>").error, /not an RSS or Atom/);
  assert.match(Feed.parse("").error, /not an RSS/);
  assert.strictEqual(Feed.parse("<rss><channel><title>Empty</title></channel></rss>").items.length, 0);
  assert.strictEqual(Feed.parse("<rss><channel><item><link>https://x.example/</link></item></channel></rss>").items[0].title, "(no title)");
});

const comments = [
  { Id: "1", VersionId: "BUD", Period: "2026-07", Measure: "REVENUE", Dims: { REGION: "EMEA" }, Text: "a", At: "2026-01-02" },
  { Id: "2", VersionId: "BUD", Period: "", Measure: "", Dims: {}, Text: "general", At: "2026-01-01" },
  { Id: "3", VersionId: "FCT", Period: "", Measure: "", Dims: {}, Text: "other version", At: "2026-01-03" },
  { Id: "4", VersionId: "BUD", Period: "2026-08", Measure: "REVENUE", Dims: { REGION: "APAC" }, Text: "apac", At: "2026-01-04" }
];

test("comment thread: version and story filters decide what shows, oldest first", () => {
  assert.deepStrictEqual(CommentThread.visible(comments, { versionId: "BUD", filters: {} }).map((c) => c.Id), ["2", "1", "4"]);
  assert.deepStrictEqual(CommentThread.visible(comments, { versionId: "BUD", filters: { REGION: ["EMEA"] } }).map((c) => c.Id), ["2", "1"]);
  assert.deepStrictEqual(CommentThread.visible(comments, { versionId: "BUD", filters: { PERIOD: ["2026-08"], VERSION: ["BUD"] } }).map((c) => c.Id), ["2", "4"]);
  assert.deepStrictEqual(CommentThread.visible(comments, { filters: {} }).length, 4);
  assert.deepStrictEqual(CommentThread.visible(null, {}), []);
});

test("comment thread: what a comment is about, in words", () => {
  const model = { Dimensions: [{ DimId: "REGION", Members: [{ Id: "EMEA", Text: "Europe, Middle East, Africa" }] }], Measures: [{ MeasureId: "REVENUE", Label: "Revenue" }] };
  assert.strictEqual(CommentThread.where(comments[0], model), "Europe, Middle East, Africa, Jul 2026, Revenue");
  assert.strictEqual(CommentThread.where(comments[1], model), "");
});

test("comment thread: a new comment is checked and follows the story's single-member filters", () => {
  assert.match(CommentThread.create("  ", { modelId: "M", versionId: "BUD" }).error, /Write a comment/);
  assert.match(CommentThread.create("x".repeat(1001), { modelId: "M", versionId: "BUD" }).error, /1000 characters/);
  assert.match(CommentThread.create("hi", { modelId: "M", versionId: "" }).error, /Choose one version/);
  const c = CommentThread.create(" Check this ", { modelId: "M", versionId: "BUD", measure: "REVENUE", filters: { REGION: ["EMEA"], PRODUCT: ["A", "B"], PERIOD: ["2026-07"], VERSION: ["BUD"] }, author: "ME" });
  assert.deepStrictEqual([c.Text, c.Period, c.Measure, c.Dims, c.VersionId, c.Author], ["Check this", "2026-07", "REVENUE", { REGION: "EMEA" }, "BUD", "ME"]);
  assert.notStrictEqual(c.Id, CommentThread.create("x", { modelId: "M", versionId: "BUD" }).Id);
});
