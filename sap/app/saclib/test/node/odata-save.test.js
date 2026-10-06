const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

// The OData provider needs the app's OData model; these tests only use its plain request layer, so a stub model is enough.
globalThis.__sapStubs = { "sap/ui/model/Filter": class Filter { constructor(a, b, c) { this.path = a; this.op = b; this.value = c; } }, "sap/ui/model/FilterOperator": { EQ: "EQ" } };
const ODataV4Provider = req("zsac/lib/provider/ODataV4Provider");

function provider(calls, failOn) {
  const p = new ODataV4Provider({ model: {} });
  p._request = async (method, path, body) => {
    calls.push([method, path, body]);
    if (failOn && failOn(method, path, body)) { throw Object.assign(new Error("refused"), { status: 400 }); }
    return {};
  };
  return p;
}
const widget = (n) => ({ StoryId: "S1", WidgetId: "W" + n, Title: "t" + n });
const old = { StoryId: "S1", StoryName: "Old", Status: "D", _Widget: [widget(1), widget(2)] };
const next = { StoryId: "S1", StoryName: "New", Status: "D", _Widget: [widget(2), widget(3)] };
const CH = [{ prop: "_Widget", path: "/Widget", keys: ["StoryId", "WidgetId"] }];

test("odata save of an existing object: PATCH the fields, replace the children, never delete the object", async () => {
  const calls = []; const p = provider(calls);
  await p._updateDeep("/Story(StoryId='S1')", next, old, CH, ["StoryId"]);
  assert.deepStrictEqual(calls.map((c) => c[0] + " " + c[1]), [
    "PATCH /Story(StoryId='S1')",
    "DELETE /Widget(StoryId='S1',WidgetId='W1')", "DELETE /Widget(StoryId='S1',WidgetId='W2')",
    "POST /Story(StoryId='S1')/_Widget", "POST /Story(StoryId='S1')/_Widget"
  ]);
  assert.deepStrictEqual(calls[0][2], { StoryName: "New", Status: "D" }); // no key, no children in the PATCH
  assert.ok(!calls.some((c) => c[0] === "DELETE" && c[1] === "/Story(StoryId='S1')"));
});

test("odata save: when a child is refused the old fields and children are put back and the refusal is reported", async () => {
  const calls = []; let seen = 0;
  const p = provider(calls, (m, path, body) => m === "POST" && body && body.WidgetId === "W3" && ++seen === 1);
  await assert.rejects(p._updateDeep("/Story(StoryId='S1')", next, old, CH, ["StoryId"]), /refused/);
  const tail = calls.slice(-6).map((c) => c[0] + " " + (c[2] ? JSON.stringify(c[2]) : c[1]));
  assert.ok(tail.some((t) => t.startsWith("PATCH") && t.includes('"StoryName":"Old"')), tail.join("\n")); // the old fields are back
  assert.ok(calls.filter((c) => c[0] === "POST" && c[2].WidgetId === "W1").length === 1); // and the old children
});

test("odata sharing: a user is known from CurrentUser and a share list becomes access", async () => {
  const p = new ODataV4Provider({ model: {} });
  p._list = async (path) => {
    if (path === "/Share") { return [{ ObjectKind: "STORY", ObjectId: "S1", Principal: "BOB", AccessLevel: "WRITE" }]; }
    if (path === "/Story") { return [{ StoryId: "S1", StoryName: "x", OwnerId: "ALICE", CurrentUser: "BOB", PagesJson: "[]", Filters: "{}" }, { StoryId: "S2", StoryName: "y", OwnerId: "ALICE", CurrentUser: "BOB", PagesJson: "[]", Filters: "{}" }, { StoryId: "S3", StoryName: "z", OwnerId: "", CurrentUser: "BOB", PagesJson: "[]", Filters: "{}" }]; }
    return [];
  };
  const list = await p.listStories();
  assert.deepStrictEqual(list.map((s) => s.Access), ["WRITE", "NONE", "WRITE"]);
  assert.strictEqual(await p.currentUser(), "BOB");
});
