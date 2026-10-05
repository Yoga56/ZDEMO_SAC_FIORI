const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const MockProvider = req("zsac/lib/provider/MockProvider");
const LiveSource = req("zsac/lib/provider/LiveSource");
const FakeODataService = req("zsac/lib/provider/FakeODataService");
const ModelSchema = req("zsac/lib/core/ModelSchema");
const Schema = req("zsac/lib/planning/MultiActionSchema");

const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "runs", "comments"].forEach((n) => {
  seed[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
});
const make = () => new MockProvider({ seed, persist: false });
const sum = (facts, measure, pred) => Math.round(facts.filter((f) => f.Measure === measure && (!pred || pred(f))).reduce((s, f) => s + f.Value, 0));

test("live source: periods in the three formats, query text, definition checks", () => {
  assert.strictEqual(LiveSource.toPeriod("202603", "YYYYMM"), "2026-03");
  assert.strictEqual(LiveSource.toPeriod("2026-03", "YYYY-MM"), "2026-03");
  assert.strictEqual(LiveSource.toPeriod("2026-03-15", "DATE"), "2026-03");
  assert.strictEqual(LiveSource.toPeriod("2026013", "YYYYMM"), null);
  assert.strictEqual(LiveSource.toPeriod("202613", "YYYYMM"), null);
  const model = ModelSchema.normalize(seed.models.find((m) => m.ModelId === "SALES_LIVE"));
  const q = LiveSource.buildQuery(model, { REGION: ["EMEA", "APAC"], PERIOD: ["2026-01", "2026-02"], MEASURE: ["REVENUE"] });
  const apply = decodeURIComponent(q.url.split("$apply=")[1]);
  assert.strictEqual(apply, "filter((Region eq 'EMEA' or Region eq 'APAC') and (FiscalPeriod eq '202601' or FiscalPeriod eq '202602'))/groupby((FiscalPeriod,Region,Product,Channel),aggregate(Revenue with sum as REVENUE))");
  assert.ok(q.url.startsWith("mock://cds/ZSALES_CUBE/ZSalesCube?"));
  const dated = Object.assign({}, model, { Source: Object.assign({}, model.Source, { PeriodField: "PostingDate", PeriodFormat: "DATE" }) });
  assert.match(decodeURIComponent(LiveSource.buildQuery(dated, { PERIOD: ["2026-02"] }).url), /\(PostingDate ge 2026-02-01 and PostingDate le 2026-02-28\)/);
  assert.deepStrictEqual(LiveSource.validate(model), []);
  const bad = Object.assign({}, model, { Source: Object.assign({}, model.Source, { Service: "ftp://x", Entity: "", Dims: { REGION: "Region" }, Measures: {} }) });
  assert.ok(LiveSource.validate(bad).length >= 5);
  assert.ok(ModelSchema.validate(bad).some((x) => /service URL/.test(x)));
  assert.strictEqual(model.PlanningEnabled, false, "a live model is read only");
});

test("live model: reads the CDS view through the service, aggregation done by the service", async () => {
  const p = make();
  const actual = seed.facts.filter((f) => f.ModelId === "SALES_PLAN" && f.VersionId === "ACT");
  const live = await p.readFacts("SALES_LIVE", {});
  assert.strictEqual(live.length, actual.length);
  assert.ok(live.every((f) => f.VersionId === "ACT" && f.ModelId === "SALES_LIVE"));
  assert.strictEqual(sum(live, "REVENUE"), sum(actual, "REVENUE"));
  const emea = await p.readFacts("SALES_LIVE", { REGION: ["EMEA"], PERIOD: ["2026-03"], MEASURE: ["COST"] });
  assert.strictEqual(sum(emea, "COST"), sum(actual, "COST", (f) => f.Dim1 === "EMEA" && f.Period === "2026-03"));
  assert.ok(emea.every((f) => f.Measure === "COST" && f.Period === "2026-03" && f.Dim1 === "EMEA"));
  assert.deepStrictEqual(await p.readFacts("SALES_LIVE", { VERSION: ["BUD"] }), []);
  const r = await p.query({ ModelId: "SALES_LIVE", Rows: ["REGION"], Columns: ["VERSION"], Filters: { VERSION: ["ACT"], MEASURE: ["REVENUE"] } });
  assert.strictEqual(r.rowKeys.length, 4);
  assert.strictEqual(Math.round(r.grand), sum(actual, "REVENUE"));
  // a hierarchy node selects its subtree through the usual filter expansion
  const world = await p.query({ ModelId: "SALES_LIVE", Rows: [], Columns: [], Filters: { REGION: ["EASTERN"], MEASURE: ["REVENUE"] } });
  assert.strictEqual(Math.round(world.grand), sum(actual, "REVENUE", (f) => f.Dim1 === "EMEA" || f.Dim1 === "APAC"));
});

test("live model: one locked version, no writes, nothing in other versions", async () => {
  const p = make();
  const versions = await p.listVersions("SALES_LIVE");
  assert.strictEqual(versions.length, 1);
  assert.strictEqual(versions[0].VersionId, "ACT");
  assert.strictEqual(versions[0].Locked, true);
  await assert.rejects(() => p.writeFacts("SALES_LIVE", [{ VersionId: "ACT", Period: "2026-01", Measure: "REVENUE", Dim1: "EMEA", Value: 1 }]), /read only/);
  await assert.rejects(() => p.deleteFacts("SALES_LIVE", []), /read only/);
});

test("source helpers: discover fields, load members and the period range, try a mapping", async () => {
  const p = make();
  const sets = await p.discoverSource("mock://cds/ZSALES_CUBE");
  assert.deepStrictEqual(sets.map((s) => s.name), ["ZSalesCube"]);
  assert.deepStrictEqual(sets[0].properties.map((x) => x.name), ["Region", "Product", "Channel", "FiscalPeriod", "Revenue", "Cost"]);
  const model = await p.getModel("SALES_LIVE");
  const found = await p.loadSourceMembers(model);
  assert.deepStrictEqual(found.Members.REGION.map((m) => m.Id), ["AMER", "APAC", "EMEA", "LATAM"]);
  assert.deepStrictEqual([found.PeriodFrom, found.PeriodTo], ["2026-01", "2026-09"]);
  const t = await p.testSource(model);
  assert.ok(t.Count > 100 && t.Sample.length === 5);
  await assert.rejects(() => p.discoverSource("mock://cds/NOPE"), /answered 404/);
});

test("date field: days are merged into months", async () => {
  const fake = FakeODataService.createFetch({ "mock://cds/D": { entitySet: "Doc", properties: {}, rows: () => [
    { Region: "EMEA", PostingDate: "2026-01-05", Amount: 10 }, { Region: "EMEA", PostingDate: "2026-01-20", Amount: 5 }, { Region: "EMEA", PostingDate: "2026-02-01", Amount: 7 },
    { Region: "APAC", PostingDate: "2026-02-03", Amount: 1 }] } });
  const model = ModelSchema.normalize({ ModelId: "D", Name: "d", PeriodFrom: "2026-01", PeriodTo: "2026-12", Dimensions: [{ DimId: "REGION", Slot: 1, Members: ["EMEA", "APAC"] }],
    Measures: [{ MeasureId: "AMOUNT", Aggregation: "SUM" }, { MeasureId: "TOP", Aggregation: "MAX" }],
    Source: { Mode: "LIVE", Service: "mock://cds/D", Entity: "Doc", PeriodField: "PostingDate", PeriodFormat: "DATE", Dims: { REGION: "Region" }, Measures: { AMOUNT: "Amount", TOP: "Amount" } } });
  const io = LiveSource.browserFetch(fake);
  const facts = await LiveSource.readFacts(model, {}, io.json);
  const get = (m, period, region) => facts.find((f) => f.Measure === m && f.Period === period && f.Dim1 === region).Value;
  assert.strictEqual(get("AMOUNT", "2026-01", "EMEA"), 15);
  assert.strictEqual(get("TOP", "2026-01", "EMEA"), 10);
  assert.strictEqual(get("AMOUNT", "2026-02", "APAC"), 1);
  const feb = await LiveSource.readFacts(model, { PERIOD: ["2026-02"], MEASURE: ["AMOUNT"] }, io.json);
  assert.deepStrictEqual(feb.map((f) => f.Value).sort(), [1, 7]);
  const tiny = Object.assign({}, model, { Source: Object.assign({}, model.Source, { MaxRows: 2 }) });
  await assert.rejects(() => LiveSource.readFacts(tiny, {}, io.json), /more than 2 rows/);
});

test("import model: rows of the CDS view are copied into a version (update, replace) and refused into a locked one", async () => {
  const p = make();
  const actual = seed.facts.filter((f) => f.ModelId === "SALES_PLAN" && f.VersionId === "ACT");
  const r = await p.importFromSource("SALES_IMPORT", { VersionId: "ACT", Filters: {}, Mode: "UPDATE" });
  assert.strictEqual(r.Written, actual.length);
  const own = await p.readFacts("SALES_IMPORT", { VERSION: ["ACT"] });
  assert.strictEqual(sum(own, "REVENUE"), sum(actual, "REVENUE"));
  assert.ok(own.every((f) => f.ModelId === "SALES_IMPORT"));
  await p.writeFacts("SALES_IMPORT", [{ VersionId: "ACT", Period: "2026-02", Measure: "REVENUE", Dim1: "XX", Dim2: "YY", Dim3: "ZZ", Value: 5 }]);
  const again = await p.importFromSource("SALES_IMPORT", { VersionId: "ACT", Filters: { PERIOD: ["2026-02"] }, Mode: "REPLACE" });
  assert.ok(again.Deleted > 0 && again.Deleted === (await p.readFacts("SALES_IMPORT", { VERSION: ["ACT"], PERIOD: ["2026-02"] })).length + 1, "the stray fact of February was deleted and the rest rewritten");
  assert.strictEqual((await p.readFacts("SALES_IMPORT", { VERSION: ["ACT"] })).length, actual.length);
  await p.saveVersion({ ModelId: "SALES_IMPORT", VersionId: "ACT", Name: "Actual", Category: "ACTUAL", Locked: true, Owner: "SYSTEM", SourceVersion: "", Status: "P" });
  await assert.rejects(() => p.importFromSource("SALES_IMPORT", { VersionId: "ACT", Filters: {}, Mode: "UPDATE" }), /locked/);
  await assert.rejects(() => p.importFromSource("SALES_PLAN", { VersionId: "BUD", Filters: {}, Mode: "UPDATE" }), /no import source/);
  await assert.rejects(() => p.importFromSource("SALES_IMPORT", { VersionId: "NOPE", Filters: {}, Mode: "UPDATE" }), /does not exist/);
});

test("multi action step Import from Source: parameters choose the months, validation checks the model and version", async () => {
  const p = make();
  const ctx = async () => ({ models: await p.listModels(), versions: await p.listVersions(), actions: await p.listDataActions() });
  const a = Schema.normalizeAction(await p.getMultiAction("MA_LOAD_ACTUALS"));
  assert.deepStrictEqual(Schema.validate(a, await ctx()).filter((x) => x.severity === "Error"), []);
  const r = await p.runMultiAction("MA_LOAD_ACTUALS", { Values: { From: ["2026-03"], To: ["2026-04"] } });
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  assert.match(r.Steps[0].message, /\(2026-03 to 2026-04\)/);
  const months = new Set((await p.readFacts("SALES_IMPORT", { VERSION: ["ACT"] })).map((f) => f.Period));
  assert.deepStrictEqual(Array.from(months).sort(), ["2026-03", "2026-04"]);
  const bad = Schema.normalizeAction({ Name: "x", Steps: [
    { StepType: "SOURCE", ModelId: "SALES_PLAN", TargetVersion: "ACT" },
    { StepType: "SOURCE", ModelId: "SALES_IMPORT", TargetVersion: "NOPE", FromPeriod: "2026-5", ToPeriod: "2026-01" },
    { StepType: "SOURCE", ModelId: "SALES_IMPORT", TargetVersion: "BUD", Mode: "REPLACE" }] });
  const msgs = Schema.validate(bad, await ctx()).map((x) => x.severity + ": " + x.message).join("\n");
  for (const part of ["has no import source", "version NOPE does not exist", "not of the form 2026-03", "without months the whole version is replaced"]) { assert.ok(msgs.includes(part), part + "\n" + msgs); }
});

test("a service that cannot aggregate: the rows are read as they are and aggregated here", async () => {
  LiveSource.resetCapabilities();
  const rows = [
    { Region: "EMEA", Period: "202601", Amount: 10, Rate: 2 }, { Region: "EMEA", Period: "202601", Amount: 30, Rate: 4 }, { Region: "APAC", Period: "202601", Amount: 5, Rate: 1 },
    { Region: "EMEA", Period: "202602", Amount: 7, Rate: 5 }];
  const calls = [];
  const fake = FakeODataService.createFetch({ "mock://cds/N": { entitySet: "N", properties: {}, noApply: true, rows: () => rows } });
  const io = LiveSource.browserFetch((u, i) => { calls.push(decodeURIComponent(u)); return fake(u, i); });
  const model = ModelSchema.normalize({ ModelId: "N", Name: "n", PeriodFrom: "2026-01", PeriodTo: "2026-12", Dimensions: [{ DimId: "REGION", Slot: 1, Members: ["EMEA", "APAC"] }],
    Measures: [{ MeasureId: "AMOUNT", Aggregation: "SUM" }, { MeasureId: "RATE", Aggregation: "AVG" }],
    Source: { Mode: "LIVE", Service: "mock://cds/N", Entity: "N", PeriodField: "Period", PeriodFormat: "YYYYMM", Dims: { REGION: "Region" }, Measures: { AMOUNT: "Amount", RATE: "Rate" } } });
  const facts = await LiveSource.readFacts(model, { REGION: ["EMEA"] }, io.json);
  const get = (m, p) => facts.find((f) => f.Measure === m && f.Period === p).Value;
  assert.strictEqual(get("AMOUNT", "2026-01"), 40);
  assert.strictEqual(get("RATE", "2026-01"), 3, "an average is the average of the rows, not a sum");
  assert.strictEqual(facts.length, 4);
  assert.ok(calls[0].indexOf("$apply") >= 0 && calls[1].indexOf("$apply") < 0 && /\$select=Period,Region,Amount,Rate/.test(calls[1]) && /\$filter=\(Region eq 'EMEA'\)/.test(calls[1]));
  calls.length = 0;
  await LiveSource.readFacts(model, {}, io.json);
  assert.strictEqual(calls.length, 1, "the service is remembered as unable to aggregate");
  const members = await LiveSource.loadMembers(model, io.json);
  assert.deepStrictEqual(members.Members.REGION.map((m) => m.Id), ["APAC", "EMEA"]);
  assert.deepStrictEqual([members.PeriodFrom, members.PeriodTo], ["2026-01", "2026-02"]);
  LiveSource.resetCapabilities();
});

test("a failing service is reported, not swallowed", async () => {
  LiveSource.resetCapabilities();
  const model = ModelSchema.normalize(seed.models.find((m) => m.ModelId === "SALES_LIVE"));
  const io = LiveSource.browserFetch(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: { value: "No authorization" } } }) }));
  await assert.rejects(() => LiveSource.readFacts(model, {}, io.json), /answered 403: No authorization/);
});
