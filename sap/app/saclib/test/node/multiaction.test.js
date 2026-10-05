const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const MockProvider = req("zsac/lib/provider/MockProvider");
const Schema = req("zsac/lib/planning/MultiActionSchema");
const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "runs"].forEach((n) => {
  seed[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
});
const make = () => new MockProvider({ seed, persist: false });
const ctxOf = async (p) => ({ models: await p.listModels(), versions: await p.listVersions(), actions: await p.listDataActions() });

test("multi action: the seeded action validates without errors", async () => {
  const p = make();
  const a = Schema.normalizeAction(await p.getMultiAction("MA_FORECAST_CYCLE"));
  assert.deepStrictEqual(Schema.validate(a, await ctxOf(p)).filter((x) => x.severity === "Error"), []);
  assert.deepStrictEqual(Object.keys(Schema.usage(a)).sort(), ["Region", "Target", "Uplift"]);
});

test("multi action: validation finds missing parameters, wrong types, locked targets", async () => {
  const p = make();
  const a = Schema.normalizeAction({ Name: "", Parameters: [{ Id: "A", Type: "MEMBER", ModelId: "SALES_PLAN", DimId: "REGION" }, { Id: "A", Type: "NUMBER", Default: "x" }, { Id: "R", Type: "MEMBER", ModelId: "SALES_PLAN", DimId: "REGION" }], Steps: [
    { StepType: "DATAACTION", ActionId: "DA_FORECAST_FROM_ACT", ParamMap: { Uplift: "@Nope", Region: "@A" } },
    { StepType: "PUBLISH", ModelId: "SALES_PLAN", SourceVersion: "FCT", TargetVersion: "ACT" },
    { StepType: "PUBLISH", ModelId: "SALES_PLAN", SourceVersion: "FCT", TargetVersion: "@R" },
    { StepType: "DATAACTION", ActionId: "GONE" }] });
  const msgs = Schema.validate(a, await ctxOf(p)).map((x) => x.message).join("\n");
  for (const part of ["needs a name", "defined twice", "default is not a number", "parameter @Nope does not exist", "is locked", "holds members of REGION, not VERSION", "GONE does not exist"]) {
    assert.ok(msgs.includes(part), part + "\n" + msgs);
  }
});

test("multi action run maps its parameters onto the data action and publishes the chosen version", async () => {
  const p = make();
  const r = await p.runMultiAction("MA_FORECAST_CYCLE", { Values: { Region: ["EMEA"], Uplift: 2, Target: ["BUD"] } });
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  assert.strictEqual(r.Steps.length, 2);
  // Q3 forecast of the chosen region is twice the actual
  const act = (await p.readFacts("SALES_PLAN", { VERSION: ["ACT"], PERIOD: ["2026-07"], MEASURE: ["REVENUE"], REGION: ["EMEA"] }))[0];
  const bud = (await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], PERIOD: ["2026-07"], MEASURE: ["REVENUE"], REGION: ["EMEA"] })).find((f) => f.Dim1 === act.Dim1 && f.Dim2 === act.Dim2 && f.Dim3 === act.Dim3);
  assert.ok(Math.abs(bud.Value - act.Value * 2) < 0.01, bud.Value + " vs " + act.Value);
  const runs = await p.listRuns();
  assert.ok(runs.some((x) => x.Kind === "MULTI" && x.Status === "S" && /Uplift=2/.test(x.ParamsText)));
});

test("multi action run: inactive steps are skipped and the first failing step stops the run", async () => {
  const p = make();
  await p.saveMultiAction({ Id: "T", Name: "t", Parameters: [], Steps: [
    { StepNo: 10, StepType: "PUBLISH", Name: "skip me", Active: false, ModelId: "SALES_PLAN", SourceVersion: "FCT", TargetVersion: "BUD" },
    { StepNo: 20, StepType: "PUBLISH", Name: "bad", ModelId: "SALES_PLAN", SourceVersion: "FCT", TargetVersion: "ACT" },
    { StepNo: 30, StepType: "DATAACTION", Name: "never", ActionId: "DA_FORECAST_FROM_ACT" }] });
  const r = await p.runMultiAction("T", {});
  assert.strictEqual(r.Status, "E");
  assert.strictEqual(r.Steps.length, 2);
  assert.match(r.Steps[0].message, /skipped/);
  assert.match(r.Steps[1].message, /locked/);
});

test("version management and data locking steps: snapshot, lock, unlock, revert, delete", async () => {
  const p = make();
  const r = await p.runMultiAction("MA_CLOSE_VERSION", { Values: { Version: ["BUD"] } });
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  const versions = await p.listVersions("SALES_PLAN");
  assert.ok(versions.some((v) => v.Category === "PRIVATE" && v.Name === "Snapshot before close" && v.SourceVersion === "BUD"));
  assert.strictEqual(versions.find((v) => v.VersionId === "BUD").Locked, true);
  await p.saveMultiAction({ Id: "U", Name: "u", Parameters: [], Steps: [
    { StepNo: 10, StepType: "LOCK", ModelId: "SALES_PLAN", Operation: "UNLOCK", Version: "BUD" },
    { StepNo: 20, StepType: "VERSION", ModelId: "SALES_PLAN", Operation: "DELETE", Version: "PRIV1" }] });
  const u = await p.runMultiAction("U", {});
  assert.strictEqual(u.Status, "S", u.Log.join("\n"));
  const after = await p.listVersions("SALES_PLAN");
  assert.strictEqual(after.find((v) => v.VersionId === "BUD").Locked, false);
  assert.ok(!after.some((v) => v.VersionId === "PRIV1"));
});

test("version management and data locking validation", async () => {
  const p = make();
  const a = Schema.normalizeAction({ Name: "x", Steps: [
    { StepType: "LOCK", ModelId: "OPEX_PLAN", Operation: "LOCK", Version: "BUD" },
    { StepType: "VERSION", ModelId: "SALES_PLAN", Operation: "REVERT", Version: "BUD" },
    { StepType: "VERSION", ModelId: "SALES_PLAN", Operation: "DELETE", Version: "ACT" },
    { StepType: "VERSION", ModelId: "SALES_PLAN", Operation: "CREATE_PRIVATE", SourceVersion: "NOPE" },
    { StepType: "LOCK", Operation: "LOCK" }] });
  const r = Schema.validate(a, await ctxOf(p));
  const msgs = r.map((x) => x.severity + ": " + x.message).join("\n");
  for (const part of ["Data Locking is not switched on", "is not a private version", "is locked, unlock it first", "version NOPE does not exist", "choose the model"]) {
    assert.ok(msgs.includes(part), part + "\n" + msgs);
  }
});
