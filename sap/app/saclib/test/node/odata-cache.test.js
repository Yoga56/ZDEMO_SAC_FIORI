const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

globalThis.__sapStubs = { "sap/ui/model/Filter": class Filter { constructor(a, b, c) { this.path = a; this.op = b; this.value = c; } }, "sap/ui/model/FilterOperator": { EQ: "EQ" } };
const ODataV4Provider = req("zsac/lib/provider/ODataV4Provider");

// a stub of the OData model: every bindList + requestContexts is one round trip, counted
function provider(rows) {
  const trips = [];
  const model = {
    bindList(path, a, b, filters, params) {
      return { requestContexts: async (start, n) => { trips.push({ path, filters, params, n }); await new Promise((r) => setTimeout(r, 5)); return (rows[path] || []).map((r) => ({ getObject: () => r })); } };
    },
    getServiceUrl: () => "/svc/"
  };
  const p = new ODataV4Provider({ model });
  p._request = async () => { p._bust(); return {}; };      // a write: the real _request empties the cache itself
  return { p, trips };
}

test("the same read twice is one round trip; a different read is another", async () => {
  const { p, trips } = provider({ "/Version": [{ VersionId: "A" }] });
  await p._list("/Version", [{ path: "ModelId", value: "M1" }]);
  await p._list("/Version", [{ path: "ModelId", value: "M1" }]);
  assert.strictEqual(trips.length, 1);
  await p._list("/Version", [{ path: "ModelId", value: "M2" }]);
  assert.strictEqual(trips.length, 2);
});

test("the same read made at the same time is one request", async () => {
  const { p, trips } = provider({ "/Fact": [{ Value: 1 }] });
  const [a, b, c] = await Promise.all([p._list("/Fact", []), p._list("/Fact", []), p._list("/Fact", [])]);
  assert.strictEqual(trips.length, 1);
  assert.deepStrictEqual([a.length, b.length, c.length], [1, 1, 1]);
});

test("every caller gets its own copy of the rows", async () => {
  const { p } = provider({ "/Fact": [{ Value: 1 }] });
  const a = await p._list("/Fact", []);
  a[0].Value = 99; a.push({ Value: 5 });
  const b = await p._list("/Fact", []);
  assert.deepStrictEqual(b, [{ Value: 1 }]);
});

test("a write empties the cache: the next read goes to the server", async () => {
  const { p, trips } = provider({ "/Model": [{ ModelId: "M1" }] });
  await p._list("/Model", []);
  await p._request("PATCH", "/Model(ModelId='M1')", { Description: "x" });
  await p._list("/Model", []);
  assert.strictEqual(trips.length, 2);
});

test("an action and a patch empty the cache too", async () => {
  const { p, trips } = provider({ "/Version": [{ VersionId: "A" }] });
  p._m.bindContext = () => ({ setParameter() {}, execute: async () => {}, getBoundContext: () => ({ getObject: () => ({}), requestObject: async () => ({}), setProperty: async () => {} }) });
  await p._list("/Version", []);
  await p._action("/Version(a)/Publish", {});
  await p._list("/Version", []);
  await p._patch("/Version(a)", { Locked: true });
  await p._list("/Version", []);
  assert.strictEqual(trips.length, 3);
});

test("a failed read is not kept", async () => {
  let fail = true; const trips = [];
  const model = { bindList: () => ({ requestContexts: async () => { trips.push(1); if (fail) { fail = false; throw new Error("down"); } return []; } }), getServiceUrl: () => "/svc/" };
  const p = new ODataV4Provider({ model });
  await assert.rejects(p._list("/Model", []), /down/);
  await p._list("/Model", []);
  assert.strictEqual(trips.length, 2);
});

test("run history: the server sends the newest runs, a few more than shown, not the whole history", async () => {
  const { p, trips } = provider({ "/ActionRun": [], "/DataAction": [], "/MultiAction": [] });
  await p.listRuns(null, 200);
  const t = trips.find((x) => x.path === "/ActionRun");
  assert.strictEqual(t.n, 600);
  assert.strictEqual(t.params.$orderby, "StartedAt desc");
});

test("every binding made for a read, a patch or an action is destroyed after it (the model keeps bindings and their rows otherwise)", async () => {
  let made = 0, destroyed = 0;
  const bind = (fail) => { made++; return {
    requestContexts: async () => { if (fail) { throw new Error("down"); } return [{ getObject: () => ({ A: 1 }) }]; },
    getBoundContext: () => ({ getObject: () => ({}), requestObject: async () => ({}), setProperty: async () => {} }),
    setParameter() {}, execute: async () => {}, destroy() { destroyed++; } }; };
  const model = { bindList: () => bind(false), bindContext: () => bind(false), getServiceUrl: () => "/svc/" };
  const p = new ODataV4Provider({ model });
  await p._list("/Model", []);
  await p._patch("/Model(a)", { X: 1 });
  await p._action("/Model(a)/Publish", {});
  const bad = new ODataV4Provider({ model: { bindList: () => bind(true), getServiceUrl: () => "/svc/" } });
  await assert.rejects(bad._list("/Model", []), /down/);
  assert.strictEqual(destroyed, made);
  assert.strictEqual(made, 4);
});

test("a model that is in the list of models needs no request of its own", async () => {
  const model = { ModelId: "M1", ModelName: "One", Description: "", Currency: "USD", PeriodFrom: "2026-01", PeriodTo: "2026-12", PlanningEnabled: true, CurrentUser: "ALICE", OwnerId: "ALICE", _Dimension: [], _Measure: [] };
  const { p, trips } = provider({ "/Model": [model], "/Share": [] });
  const list = await p.listModels();
  const one = await p.getModel("M1");
  assert.strictEqual(one.ModelId, "M1");
  assert.strictEqual(list.length, 1);
  assert.strictEqual(trips.filter((t) => t.path === "/Model").length, 1);     // the list only
  await p.getModel("OTHER").catch(() => {});                                  // one that is not in the list is asked for
  assert.strictEqual(trips.filter((t) => t.path === "/Model").length, 2);
});
