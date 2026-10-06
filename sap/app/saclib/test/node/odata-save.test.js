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

test("odata save of a data action: steps are keyed by a number that is not quoted, the owner is not sent", async () => {
  const calls = []; const p = provider(calls);
  const row = (n) => ({ ActionId: "DA1", StepNo: n, StepType: "COPY", StepName: "s" + n, Config: "{}" });
  p.getDataAction = async () => ({ Id: "DA1", ModelId: "M", Name: "Old", Description: "", Parameters: [], Steps: [{ StepNo: 10, StepType: "COPY", Name: "s10", Description: "", Active: true }], Owner: "ALICE", Access: "WRITE" });
  p.getMultiAction = p.getDataAction;
  await p._putDataAction({ Id: "DA1", ModelId: "M", Name: "New", Description: "", Parameters: [], Steps: [{ StepNo: 10, StepType: "COPY", Name: "renamed" }], Owner: "MALLORY" });
  const text = calls.map((c) => c[0] + " " + c[1]);
  assert.strictEqual(text[0], "PATCH /DataAction(ActionId='DA1')");
  assert.ok(text.includes("DELETE /DataActionStep(ActionId='DA1',StepNo=10)"), text.join("\n"));
  assert.ok(text.includes("POST /DataAction(ActionId='DA1')/_Step"));
  assert.ok(!JSON.stringify(calls).includes("MALLORY") && !JSON.stringify(calls).includes("OwnerId"));
  assert.ok(!text.some((t) => t === "DELETE /DataAction(ActionId='DA1')"));
});

test("odata sharing: access of data and multi actions follows the shares", async () => {
  const p = new ODataV4Provider({ model: {} });
  p._list = async (path) => {
    if (path === "/Share") { return [{ ObjectKind: "MULTIACTION", ObjectId: "M1", Principal: "*", AccessLevel: "READ" }]; }
    if (path === "/MultiAction") { return [{ ActionId: "M1", ActionName: "a", OwnerId: "ALICE", CurrentUser: "BOB", Parameters: "[]" }, { ActionId: "M2", ActionName: "b", OwnerId: "ALICE", CurrentUser: "BOB", Parameters: "[]" }]; }
    return [];
  };
  assert.deepStrictEqual((await p.listMultiActions()).map((a) => a.Access), ["READ", "NONE"]);
});

test("odata calendar events: every field is read and written, the older columns follow, an existing event is patched", async () => {
  const calls = []; const p = provider(calls);
  p._list = async (path, filters) => {
    if (path === "/CalendarTask" && filters && filters.length) { return [{ TaskId: "E1" }]; }
    if (path === "/CalendarTask") { return [{ TaskId: "E1", EventType: "LOCK", ParentId: "P", Title: "Lock", ModelId: "M", VersionId: "BUD", Assignee: "ME", DueDate: "2026-10-16", StartDate: "2026-10-16", EndDate: "2026-10-16", Progress: 40, Status: "ACTIVE",
      Approver: "", Notes: "n", PeopleJson: '{"Owners":["A"]}', FilesJson: '[{"Type":"URL","Url":"https://e.com"}]', ConfigJson: '{"After":["X"]}', OwnerId: "ALICE", CurrentUser: "ALICE" }]; }
    return [];
  };
  const [t] = await p.listTasks();
  assert.deepStrictEqual([t.Type, t.ParentId, t.Progress, t.People.Owners, t.Files[0].Url, t.Config.After, t.Owner, t.Access], ["LOCK", "P", 40, ["A"], "https://e.com", ["X"], "ALICE", "OWNER"]);
  await p.saveTask({ Id: "E1", Type: "REVIEW", Title: "Changed", Status: "DONE", Progress: 100, StartDate: "2026-10-01", EndDate: "2026-10-02", Notes: "d", People: { Viewers: ["*"] }, Owner: "MALLORY", Access: "OWNER" });
  const patch = calls.find((c) => c[0] === "PATCH");
  assert.strictEqual(patch[1], "/CalendarTask(TaskId='E1')");
  assert.deepStrictEqual([patch[2].EventType, patch[2].DueDate, patch[2].Progress, patch[2].PeopleJson], ["REVIEW", "2026-10-02", 100, '{"Viewers":["*"]}']);
  assert.ok(!("TaskId" in patch[2]) && !JSON.stringify(calls).includes("MALLORY") && !JSON.stringify(calls).includes("OwnerId"));
  const fresh = []; const p2 = provider(fresh);
  p2._list = async () => [];
  await p2.saveTask({ Id: "NEW", Title: "x".repeat(300), Status: "OPEN" });
  const post = fresh.find((c) => c[0] === "POST");
  assert.strictEqual(post[1], "/CalendarTask"); assert.strictEqual(post[2].Title.length, 120);
});

test("odata model payload: lock regions and validation rules go out with a server copy (lower case, slices resolved), and come back as they were", () => {
  const p = provider([]);
  const model = { ModelId: "M", Name: "M", PeriodFrom: "2026-01", PeriodTo: "2026-12", DataLocking: true, LockDefault: "OPEN",
    Dimensions: [{ DimId: "REGION", Label: "Region", Slot: 1, Members: [{ Id: "A" }, { Id: "B" }, { Id: "ALL" }], Hierarchies: [{ Id: "H", Parents: { A: "ALL", B: "ALL" } }] }],
    Measures: [{ MeasureId: "X", Label: "X" }],
    LockRegions: [{ Id: "R1", Name: "Q1 closed", State: "LOCKED", Owners: [], Filter: { PERIOD: ["2026-Q1"], REGION: ["ALL"] } }],
    ValidationRules: [{ Id: "V1", Name: "No negatives", Measure: "X", Min: 0, Level: "ERROR" }] };
  const out = p._modelPayload(model);
  const lock = JSON.parse(out.LockJson);
  assert.deepStrictEqual(lock.srv[0].slices.find((s) => s.fname === "period").members, ["2026-01", "2026-02", "2026-03"]);
  assert.deepStrictEqual(lock.srv[0].slices.find((s) => s.fname === "dim1").members.sort(), ["A", "ALL", "B"]);
  assert.strictEqual(lock.srv[0].state, "LOCKED");
  const rule = JSON.parse(out.ValidJson).srv[0];
  assert.deepStrictEqual([rule.min_value, rule.max_value, rule.level, rule.measure], ["0", "", "ERROR", "X"]);
  const back = p._toModel(Object.assign({ ModelId: "M", ModelName: "M", _Dimension: [], _Measure: [] }, { DataLocking: true, LockJson: out.LockJson, ValidJson: out.ValidJson }));
  assert.strictEqual(back.LockRegions[0].Name, "Q1 closed");
  assert.deepStrictEqual(back.LockRegions[0].Filter, { PERIOD: ["2026-Q1"], REGION: ["ALL"] });
  assert.strictEqual(back.ValidationRules[0].Min, 0);
  // an older client stored a plain list
  assert.strictEqual(p._toModel({ ModelId: "M", ModelName: "M", LockJson: JSON.stringify([{ Id: "X", Name: "n", State: "LOCKED" }]), _Dimension: [], _Measure: [] }).LockRegions[0].Id, "X");
});
