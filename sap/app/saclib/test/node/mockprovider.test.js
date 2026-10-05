const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const MockProvider = req("zsac/lib/provider/MockProvider");
const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks"].forEach((n) => {
  seed[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
});
const make = () => new MockProvider({ seed, persist: false });

test("query aggregates revenue by region for actuals", async () => {
  const p = make();
  const r = await p.query({ ModelId: "SALES_PLAN", Rows: ["REGION"], Columns: ["VERSION"],
    Filters: { VERSION: ["ACT"], MEASURE: ["REVENUE"] } });
  assert.strictEqual(r.rowKeys.length, 4);
  assert.ok(r.grand > 0);
});

test("saving a story indexes it in Files", async () => {
  const p = make();
  await p.saveStory({ Id: "S1", Name: "Mine", Description: "", ModelId: "SALES_PLAN", Pages: [{ Id: 1, Title: "P" }], Widgets: [], Filters: {} });
  const files = await p.listFiles();
  assert.ok(files.some((f) => f.Type === "STORY" && f.ObjectId === "S1" && f.Name === "Mine"));
  await p.deleteStory("S1");
  assert.ok(!(await p.listFiles()).some((f) => f.ObjectId === "S1"));
});

test("private version: create, edit, publish to budget; actual is locked", async () => {
  const p = make();
  const v = await p.createPrivateVersion("SALES_PLAN", "BUD", "What if");
  assert.strictEqual(v.Category, "PRIVATE");
  const facts = await p.readFacts("SALES_PLAN", { VERSION: [v.VersionId], MEASURE: ["REVENUE"], PERIOD: ["2026-12"] });
  assert.ok(facts.length > 0);
  await p.writeFacts("SALES_PLAN", [Object.assign({}, facts[0], { Value: 999999 })]);
  await p.publishVersion("SALES_PLAN", v.VersionId, "BUD");
  const bud = await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], PERIOD: ["2026-12"] });
  assert.ok(bud.some((f) => f.Value === 999999));
  await assert.rejects(() => p.publishVersion("SALES_PLAN", v.VersionId, "ACT"), /locked/);
  await p.revertVersion("SALES_PLAN", v.VersionId);
  await p.deleteVersion("SALES_PLAN", v.VersionId);
  assert.strictEqual((await p.listVersions("SALES_PLAN")).some((x) => x.VersionId === v.VersionId), false);
});

test("data action writes to forecast; locked target is refused; multi action runs both steps", async () => {
  const p = make();
  const r = await p.executeDataAction("DA_FORECAST_FROM_ACT", {});
  assert.ok(r.Changed > 0);
  await p.saveDataAction({ Id: "BAD", ModelId: "SALES_PLAN", Name: "bad", Steps: [{ StepNo: 1, StepType: "DELETE", TgtVersion: "ACT", Filter: {} }] });
  await assert.rejects(() => p.executeDataAction("BAD", {}), /locked/);
  const m = await p.runMultiAction("MA_FORECAST_CYCLE", {});
  assert.strictEqual(m.Status, "S");
  assert.strictEqual(m.Log.length, 2);
});

test("a public version can be deleted with its numbers unless it is locked", async () => {
  const p = make();
  await p.saveVersion({ ModelId: "SALES_PLAN", VersionId: "BUD2", Name: "Budget 2027", Category: "BUDGET", Locked: false, Owner: "ME", SourceVersion: "", Status: "P" });
  await p.writeFacts("SALES_PLAN", [{ VersionId: "BUD2", Period: "2026-01", Measure: "REVENUE", Dim1: "APAC", Dim2: "Analytics", Dim3: "Direct", Value: 5 }]);
  await p.deleteVersion("SALES_PLAN", "BUD2");
  assert.strictEqual((await p.listVersions("SALES_PLAN")).some((v) => v.VersionId === "BUD2"), false);
  assert.strictEqual((await p.readFacts("SALES_PLAN", { VERSION: ["BUD2"] })).length, 0);
  await assert.rejects(() => p.deleteVersion("SALES_PLAN", "ACT"), /locked/);
});

test("data action: parameters, dry run writes nothing, runs are logged", async () => {
  const p = make();
  const before = await p.readFacts("SALES_PLAN", { VERSION: ["FCT"] });
  const dry = await p.previewDataAction("DA_FORECAST_FROM_ACT", { Values: { Uplift: 1.2 } });
  assert.strictEqual(dry.Status, "S");
  assert.ok(dry.Steps.length === 2 && dry.DryRun);
  assert.strictEqual((await p.readFacts("SALES_PLAN", { VERSION: ["FCT"] })).length, before.length);
  assert.strictEqual((await p.listRuns()).length, 0);
  const r = await p.executeDataAction("DA_FORECAST_CYCLE", {});
  assert.strictEqual(r.Status, "S");
  const runs = await p.listRuns();
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].Kind, "DATA");
});
