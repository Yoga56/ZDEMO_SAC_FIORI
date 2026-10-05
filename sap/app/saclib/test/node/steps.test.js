const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const MockProvider = req("zsac/lib/provider/MockProvider");
const DataProvider = req("zsac/lib/core/DataProvider");
const Schema = req("zsac/lib/planning/MultiActionSchema");
const ImportEngine = req("zsac/lib/planning/ImportEngine");
const Forecaster = req("zsac/lib/planning/Forecaster");
const CsvParser = req("zsac/lib/core/CsvParser");
const StepRunners = req("zsac/lib/planning/StepRunners");

const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "runs", "comments"].forEach((n) => {
  seed[n] = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8"));
});
const make = () => new MockProvider({ seed, persist: false });
const ctxOf = async (p) => ({ models: await p.listModels(), versions: await p.listVersions(), actions: await p.listDataActions() });
const save = (p, steps, parameters) => p.saveMultiAction({ Id: "T", Name: "t", Parameters: parameters || [], Steps: steps.map((s, i) => Object.assign({ StepNo: (i + 1) * 10 }, s)) });

const CSV = "Region;Product;Channel;Month;Amount\nEMEA;Cloud ERP;Direct;2026-10;100\nEMEA;Cloud ERP;Direct;2026-11;110,5\n";

test("csv: delimiter is detected, quotes and empty lines are handled", () => {
  assert.deepStrictEqual(CsvParser.parse("a;b\n1;2\n\n"), [["a", "b"], ["1", "2"]]);
  assert.deepStrictEqual(CsvParser.parse('a,b\n"x, y","say ""hi"""\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepStrictEqual(CsvParser.parse("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("import engine: mapping guess, rejects with line numbers, duplicate rows add up", async () => {
  const p = make();
  const model = await p.getModel("SALES_PLAN");
  const versions = await p.listVersions("SALES_PLAN");
  const mapping = ImportEngine.guessMapping(model, ImportEngine.header(CSV));
  assert.deepStrictEqual(mapping, { Region: "REGION", Product: "PRODUCT", Channel: "CHANNEL", Month: "PERIOD", Amount: "VALUE" });
  const text = "Region,Product,Channel,Month,Amount\nEMEA,Cloud ERP,Direct,2026-10,5\nEMEA,Cloud ERP,Direct,2026-10,7\nMars,Cloud ERP,Direct,2026-10,1\nEMEA,Cloud ERP,Direct,2027-01,1\nEMEA,Cloud ERP,Direct,2026-10,abc\n";
  const r = ImportEngine.build(model, versions, text, { Mapping: { Region: "REGION", Product: "PRODUCT", Channel: "CHANNEL", Month: "PERIOD", Amount: "VALUE" } }, { targetVersion: "FCT", measureId: "REVENUE" });
  assert.strictEqual(r.facts.length, 1);
  assert.strictEqual(r.facts[0].Value, 12);
  assert.deepStrictEqual(r.rejects.map((x) => x.line), [4, 5, 6]);
  assert.match(r.rejects[0].reason, /unknown Region member Mars/);
  assert.match(r.rejects[1].reason, /outside the model/);
  const locked = ImportEngine.build(model, versions, text, { Mapping: {} }, { targetVersion: "ACT", measureId: "REVENUE" });
  assert.match(locked.rejects[0].reason, /locked|unknown/);
});

test("forecaster: linear, moving average, exponential smoothing, seasonal naive", () => {
  assert.deepStrictEqual(Forecaster.forecast([10, 20, 30, 40], [1, 2], "LINEAR"), [50, 60]);
  assert.deepStrictEqual(Forecaster.forecast([10, 20, 30, 40], [1], "MOVING_AVERAGE", { window: 2 }), [35]);
  assert.deepStrictEqual(Forecaster.forecast([10, 10, 10], [1], "EXP_SMOOTHING", { alpha: 0.5 }), [10]);
  const year = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.deepStrictEqual(Forecaster.forecast(year, [1, 2], "SEASONAL_NAIVE"), [1, 2]);
  assert.deepStrictEqual(Forecaster.forecast([5], [1], "LINEAR"), [null]);
  assert.deepStrictEqual(Forecaster.forecast([1, null, 3], [1], "LINEAR"), [4]);
});

test("import step: writes facts, rejected rows stop the run (FAIL) or are skipped (SKIP), ADD adds to existing values", async () => {
  const p = make();
  const mapping = { Region: "REGION", Product: "PRODUCT", Channel: "CHANNEL", Month: "PERIOD", Amount: "VALUE" };
  const step = { StepType: "IMPORT", Name: "imp", ModelId: "SALES_PLAN", Csv: CSV.replace("110,5", "110.5"), Mapping: mapping, TargetVersion: "@V", MeasureId: "REVENUE" };
  await save(p, [step], [{ Id: "V", Type: "MEMBER", ModelId: "SALES_PLAN", DimId: "VERSION", Multi: false, Default: ["FCT"] }]);
  const r = await p.runMultiAction("T", { Values: { V: ["BUD"] } });
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  const got = await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], PERIOD: ["2026-11"], MEASURE: ["REVENUE"], REGION: ["EMEA"], PRODUCT: ["Cloud ERP"], CHANNEL: ["Direct"] });
  assert.strictEqual(got[0].Value, 110.5);

  const bad = Object.assign({}, step, { Csv: CSV.replace("EMEA;Cloud ERP;Direct;2026-10", "Mars;Cloud ERP;Direct;2026-10").replace("110,5", "110.5"), TargetVersion: "FCT" });
  const before = (await p.readFacts("SALES_PLAN", { VERSION: ["FCT"] })).length;
  await save(p, [bad]);
  const failed = await p.runMultiAction("T", {});
  assert.strictEqual(failed.Status, "E");
  assert.match(failed.Log[0], /1 of 2 rows rejected, nothing imported/);
  assert.strictEqual((await p.readFacts("SALES_PLAN", { VERSION: ["FCT"] })).length, before);
  await save(p, [Object.assign({}, bad, { OnError: "SKIP" })]);
  const skipped = await p.runMultiAction("T", {});
  assert.strictEqual(skipped.Status, "S");
  assert.match(skipped.Steps[0].message, /skipped 1 rows/);

  await save(p, [Object.assign({}, step, { TargetVersion: "BUD", Csv: "Region;Product;Channel;Month;Amount\nEMEA;Cloud ERP;Direct;2026-11;10\n", Mode: "ADD" })]);
  await p.runMultiAction("T", {});
  const added = await p.readFacts("SALES_PLAN", { VERSION: ["BUD"], PERIOD: ["2026-11"], MEASURE: ["REVENUE"], REGION: ["EMEA"], PRODUCT: ["Cloud ERP"], CHANNEL: ["Direct"] });
  assert.strictEqual(added[0].Value, 120.5);
});

test("predictive step: linear forecast of the actuals lands in the target version", async () => {
  const p = make();
  await p.writeFacts("SALES_PLAN", [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ VersionId: "ACT", Period: "2026-0" + m, Measure: "COST", Dim1: "ZZ", Dim2: "Line", Dim3: "Web", Value: m * 100 })));
  await save(p, [{ StepType: "PREDICT", Name: "f", ModelId: "SALES_PLAN", MeasureId: "COST", SourceVersion: "ACT", TargetVersion: "FCT", HistoryFrom: "2026-01", HistoryTo: "2026-09", ForecastFrom: "2026-10", ForecastTo: "2026-12", Method: "LINEAR" }]);
  const r = await p.runMultiAction("T", {});
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  const out = (await p.readFacts("SALES_PLAN", { VERSION: ["FCT"], MEASURE: ["COST"], PERIOD: ["2026-10", "2026-11", "2026-12"] })).filter((f) => f.Dim1 === "ZZ").sort((a, b) => a.Period.localeCompare(b.Period));
  assert.deepStrictEqual(out.map((f) => f.Value), [1000, 1100, 1200]);
  await save(p, [{ StepType: "PREDICT", Name: "f", ModelId: "SALES_PLAN", MeasureId: "COST", SourceVersion: "ACT", TargetVersion: "FCT", HistoryFrom: "2026-01", HistoryTo: "2026-09", ForecastFrom: "2026-09", ForecastTo: "2026-12", Method: "LINEAR" }]);
  assert.match((await p.runMultiAction("T", {})).Log[0], /must start after the history/);
});

test("API step: parameters are substituted, the status is checked, no credentials are sent", async () => {
  const p = make();
  const calls = [];
  p.callApi = async (request) => { calls.push(request); return { status: request.Url.indexOf("fail") >= 0 ? 500 : 201, text: "{}" }; };
  await save(p, [{ StepType: "API", Name: "call", Method: "POST", Url: "https://example.com/plan/@Region/run?token=abc", Headers: [{ Name: "X-Region", Value: "@Region" }], Body: '{"uplift": @Uplift, "mail": "a@b.com"}', Expect: "200,201" }],
    [{ Id: "Region", Type: "MEMBER", ModelId: "SALES_PLAN", DimId: "REGION", Multi: true, Default: [] }, { Id: "Uplift", Type: "NUMBER", Default: 1 }]);
  const r = await p.runMultiAction("T", { Values: { Region: ["EMEA", "APAC"], Uplift: 1.2 } });
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  assert.strictEqual(calls[0].Url, "https://example.com/plan/EMEA,APAC/run?token=abc");
  assert.strictEqual(calls[0].Body, '{"uplift": 1.2, "mail": "a@b.com"}');
  assert.deepStrictEqual(calls[0].Headers, [{ Name: "X-Region", Value: "EMEA,APAC" }]);
  assert.ok(!/token/.test(r.Steps[0].message), "query string stays out of the log");
  await save(p, [{ StepType: "API", Name: "call", Method: "GET", Url: "https://example.com/fail", Expect: "2xx" }]);
  const bad = await p.runMultiAction("T", {});
  assert.strictEqual(bad.Status, "E");
  assert.match(bad.Log[0], /returned 500, expected 2xx/);
  await save(p, [{ StepType: "API", Name: "call", Method: "GET", Url: "ftp://x" }]);
  assert.match((await p.runMultiAction("T", {})).Log[0], /must start with http/);
  assert.ok(StepRunners.statusOk("2xx", 204) && !StepRunners.statusOk("200", 201) && StepRunners.statusOk("200, 404", 404));
});

test("PaPM step: simulated by the mock, refused by a source that is not connected", async () => {
  const p = make();
  await save(p, [{ StepType: "PAPM", Name: "papm", Environment: "PROD", FunctionId: "ALLOC_COSTS", Parameters: [{ Name: "Period", Value: "@Uplift" }] }], [{ Id: "Uplift", Type: "NUMBER", Default: 1 }]);
  const r = await p.runMultiAction("T", { Values: { Uplift: 3 } });
  assert.strictEqual(r.Status, "S");
  assert.match(r.Steps[0].message, /Simulated PaPM run of ALLOC_COSTS in PROD \(1 parameters\)/);
  const plain = Object.create(MockProvider.prototype);
  await assert.rejects(() => DataProvider.prototype.runPapm.call({ id: "odata" }, {}), /not connected to the data source odata/);
  assert.ok(plain);
});

test("comment step: copy and delete the comments of a version", async () => {
  const p = make();
  await save(p, [{ StepType: "COMMENT", Name: "c", ModelId: "SALES_PLAN", Operation: "COPY", SourceVersion: "BUD", TargetVersion: "FCT" }]);
  const r = await p.runMultiAction("T", {});
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  assert.strictEqual((await p.listComments("SALES_PLAN", "FCT")).length, 3);
  await save(p, [{ StepType: "COMMENT", Name: "d", ModelId: "SALES_PLAN", Operation: "DELETE", Version: "FCT" }]);
  assert.strictEqual((await p.runMultiAction("T", {})).Steps[0].touched, 3);
  assert.strictEqual((await p.listComments("SALES_PLAN", "FCT")).length, 0);
  assert.strictEqual((await p.listComments("SALES_PLAN", "BUD")).length, 2);
  await save(p, [{ StepType: "COMMENT", Name: "d", ModelId: "SALES_PLAN", Operation: "DELETE", Version: "ACT" }]);
  assert.match((await p.runMultiAction("T", {})).Log[0], /locked/);
});

test("validation of the import, predictive, API, PaPM and comment steps", async () => {
  const p = make();
  const a = Schema.normalizeAction({ Name: "x", Steps: [
    { StepType: "IMPORT", ModelId: "SALES_PLAN", Csv: "A;B\n1;2", Mapping: { A: "VALUE", B: "VALUE" } },
    { StepType: "IMPORT", ModelId: "SALES_PLAN", Csv: "" },
    { StepType: "PREDICT", ModelId: "SALES_PLAN", MeasureId: "NOPE", SourceVersion: "ACT", TargetVersion: "ACT", HistoryFrom: "2026-01", HistoryTo: "2026-05", ForecastFrom: "2026-05", ForecastTo: "2026-04", Method: "SEASONAL_NAIVE" },
    { StepType: "API", Method: "TRACE", Url: "ftp://x", Headers: [{ Name: "bad name", Value: "" }], Expect: "ok", TimeoutSec: 0 },
    { StepType: "API", Method: "POST", Url: "http://example.com/x", Body: "{oops" },
    { StepType: "PAPM", Environment: "", FunctionId: "", Parameters: [{ Name: "a" }, { Name: "a" }, { Name: "" }] },
    { StepType: "COMMENT", ModelId: "SALES_PLAN", Operation: "COPY", SourceVersion: "BUD", TargetVersion: "BUD" }] });
  const msgs = Schema.validate(a, await ctxOf(p)).map((x) => x.severity + ": " + x.message).join("\n");
  for (const part of ["VALUE is mapped to more than one column", "map one column to Period", "map one column to Region", "choose the version to import into", "header line and at least one data line",
    "measure NOPE does not exist", "version ACT is locked", "the forecast must start after the history", "the forecast starts after it ends", "at least 12 months of history",
    "unknown method TRACE", "the URL must start with http", "a header needs a name", "expected status looks like", "timeout is between", "Warning: ", "not encrypted",
    "enter the PaPM environment", "enter the PaPM function", "used twice", "needs a name", "source and target version are the same"]) {
    assert.ok(msgs.includes(part), part + "\n" + msgs);
  }
  const ok = Schema.normalizeAction(await p.getMultiAction("MA_STAT_FORECAST"));
  assert.deepStrictEqual(Schema.validate(ok, await ctxOf(p)).filter((x) => x.severity === "Error"), []);
});

test("import step: one column per measure (wide format)", async () => {
  const p = make();
  const model = await p.getModel("SALES_PLAN");
  const text = "Region;Product;Channel;Month;Revenue;Cost\nEMEA;Cloud ERP;Direct;2026-10;100;60\nEMEA;Cloud ERP;Direct;2026-11;;70\n";
  const mapping = ImportEngine.guessMapping(model, ImportEngine.header(text));
  assert.strictEqual(mapping.Revenue, "MEASURE:REVENUE");
  assert.strictEqual(mapping.Cost, "MEASURE:COST");
  await save(p, [{ StepType: "IMPORT", Name: "wide", ModelId: "SALES_PLAN", Csv: text, Mapping: mapping, TargetVersion: "FCT" }]);
  const a = Schema.normalizeAction(await p.getMultiAction("T"));
  assert.deepStrictEqual(Schema.validate(a, await ctxOf(p)).filter((x) => x.severity === "Error"), []);
  const r = await p.runMultiAction("T", {});
  assert.strictEqual(r.Status, "S", r.Log.join("\n"));
  assert.strictEqual(r.Steps[0].touched, 3, "an empty cell gives no value");
  const got = await p.readFacts("SALES_PLAN", { VERSION: ["FCT"], PERIOD: ["2026-10", "2026-11"], REGION: ["EMEA"], PRODUCT: ["Cloud ERP"], CHANNEL: ["Direct"] });
  assert.strictEqual(got.find((f) => f.Period === "2026-10" && f.Measure === "COST").Value, 60);
  assert.strictEqual(got.find((f) => f.Period === "2026-11" && f.Measure === "COST").Value, 70);
  await save(p, [{ StepType: "IMPORT", Name: "mixed", ModelId: "SALES_PLAN", Csv: text, Mapping: Object.assign({}, mapping, { Cost: "VALUE" }), TargetVersion: "FCT" }]);
  const msgs = Schema.validate(Schema.normalizeAction(await p.getMultiAction("T")), await ctxOf(p)).map((x) => x.message).join("\n");
  assert.match(msgs, /either one Value column or one column per measure/);
});

test("forecaster back-test: a perfect line has no error, noise has", async () => {
  const line = [10, 20, 30, 40, 50, 60, 70, 80];
  const perfect = Forecaster.backtest(line, "LINEAR", {});
  assert.strictEqual(perfect.abs, 0);
  assert.strictEqual(perfect.n, 2);
  const noisy = Forecaster.backtest([10, 20, 30, 40, 50, 60, 70, 40], "LINEAR", {}, 1);
  assert.ok(noisy.abs > 0 && noisy.actual === 40);
  assert.strictEqual(Forecaster.backtest([5, 6], "LINEAR", {}), null);
  const p = make();
  await p.writeFacts("SALES_PLAN", [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ VersionId: "ACT", Period: "2026-0" + m, Measure: "COST", Dim1: "ZZ", Dim2: "Line", Dim3: "Web", Value: m * 100 })));
  await save(p, [{ StepType: "PREDICT", Name: "f", ModelId: "SALES_PLAN", MeasureId: "COST", SourceVersion: "ACT", TargetVersion: "FCT", HistoryFrom: "2026-01", HistoryTo: "2026-09", ForecastFrom: "2026-10", ForecastTo: "2026-12", Method: "LINEAR" }]);
  const r = await p.runMultiAction("T", {});
  assert.match(r.Steps[0].message, /Back-test on the last 2 months of the history: the forecast was off by \d+(\.\d)?% on average/);
});
