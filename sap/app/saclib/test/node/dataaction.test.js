const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");

const Engine = req("zsac/lib/planning/DataActionEngine");
const Schema = req("zsac/lib/planning/DataActionSchema");

const model = { ModelId: "M", PlanningEnabled: true, PeriodFrom: "2025-01", PeriodTo: "2026-12",
  Dimensions: [{ DimId: "REGION", Slot: 1, Members: ["EU", "DE", "FR", "US"].map((Id) => ({ Id })),
    Hierarchies: [{ Id: "H", Parents: { DE: "EU", FR: "EU" } }] }],
  Measures: [{ MeasureId: "REV", Aggregation: "SUM" }] };
const fact = (ver, p, r, v) => ({ ModelId: "M", VersionId: ver, Period: p, Measure: "REV", Dim1: r, Dim2: "", Dim3: "", Dim4: "", Dim5: "", Value: v });
const base = [fact("ACT", "2025-01", "DE", 100), fact("ACT", "2025-02", "DE", 200), fact("ACT", "2025-01", "US", 50), fact("BUD", "2026-01", "DE", 10)];
const versions = [{ VersionId: "ACT", Locked: true }, { VersionId: "BUD", Locked: false }, { VersionId: "FCT", Locked: false }];
const get = (r, ver, p, reg) => (r.facts.find((f) => f.VersionId === ver && f.Period === p && f.Dim1 === reg) || {}).Value;
const act = (steps, extra) => Object.assign({ Id: "A", ModelId: "M", Name: "A", Steps: steps.map((s, i) => Object.assign({ StepNo: (i + 1) * 10 }, s)) }, extra);

test("copy rules: version and year shift, parameter in the filter, factor, overwrite and append", () => {
  const steps = [{ StepType: "COPY", Filter: { VERSION: ["ACT"], REGION: ["@Region"] },
    Rules: [{ Dim: "VERSION", From: "ACT", To: "BUD" }, { Dim: "PERIOD", From: "2025", To: "2026" }], Factor: "@Uplift" }];
  const action = act(steps, { Parameters: [{ Id: "Region", Type: "MEMBER", DimId: "REGION", Default: [] }, { Id: "Uplift", Type: "NUMBER", Default: 1.5 }] });
  let r = Engine.run(model, base, action, {}, { versions });
  assert.strictEqual(r.status, "S");
  assert.strictEqual(get(r, "BUD", "2026-01", "DE"), 150);        // overwrote the 10, 100 * 1.5, month kept
  assert.strictEqual(get(r, "BUD", "2026-02", "DE"), 300);
  assert.strictEqual(get(r, "BUD", "2026-01", "US"), 75);         // empty parameter: every region
  r = Engine.run(model, base, action, { Values: { Region: ["US"], Uplift: 2 } }, { versions });
  assert.strictEqual(get(r, "BUD", "2026-01", "US"), 100);
  assert.strictEqual(get(r, "BUD", "2026-01", "DE"), 10);         // DE not selected: untouched
  const append = Object.assign({}, action, { Steps: [Object.assign({}, steps[0], { WriteMode: "APPEND", StepNo: 10 })] });
  r = Engine.run(model, base, append, { Values: { Uplift: 1 } }, { versions });
  assert.strictEqual(get(r, "BUD", "2026-01", "DE"), 110);        // 10 + 100
  assert.strictEqual(r.steps[0].created, 2);
  assert.ok(r.steps[0].samples.length >= 2 && r.steps[0].updated === 1);
});

test("aggregate to one member, rule that filters on its From member", () => {
  const action = act([{ StepType: "COPY", Filter: { VERSION: ["ACT"] }, Rules: [{ Dim: "VERSION", From: "ACT", To: "FCT" }, { Dim: "PERIOD", From: "2025-01", To: "2026-01" }],
    AggregateTo: [{ Dim: "REGION", Member: "EU" }] }]);
  const r = Engine.run(model, base, action, {}, { versions });
  assert.strictEqual(get(r, "FCT", "2026-01", "EU"), 150);        // DE 100 + US 50 collapsed onto EU; February is not 2025-01 so it is not copied
  assert.ok(!r.facts.some((f) => f.VersionId === "FCT" && f.Period === "2026-02"));
});

test("allocation: equal, proportional to existing, reference version, nodes become leaves, source cleared", () => {
  const data = base.concat([fact("BUD", "2025-01", "DE", 1), fact("BUD", "2025-01", "FR", 3), fact("ACT", "2025-01", "FR", 300)]);
  const mk = (extra) => act([Object.assign({ StepType: "ALLOCATE", Filter: { VERSION: ["ACT"], REGION: ["EU"], PERIOD: ["2025-01"] }, TargetDim: "REGION", TargetMembers: ["EU"], TgtVersion: "BUD" }, extra)]);
  let r = Engine.run(model, data, mk({ Driver: "EQUAL" }), {}, { versions });
  assert.deepStrictEqual([get(r, "BUD", "2025-01", "DE"), get(r, "BUD", "2025-01", "FR")], [200, 200]);       // EU node = DE and FR, 400 split equally
  r = Engine.run(model, data, mk({ Driver: "PROPORTIONAL" }), {}, { versions });
  assert.deepStrictEqual([get(r, "BUD", "2025-01", "DE"), get(r, "BUD", "2025-01", "FR")], [100, 300]);       // like the existing 1:3
  r = Engine.run(model, data, mk({ Driver: "REFERENCE", DriverVersion: "ACT" }), {}, { versions });
  assert.deepStrictEqual([get(r, "BUD", "2025-01", "DE"), get(r, "BUD", "2025-01", "FR")], [100, 300]);       // ACT: DE 100, FR 300
  r = Engine.run(model, data, mk({ Driver: "EQUAL", WriteMode: "APPEND" }), {}, { versions });
  assert.deepStrictEqual([get(r, "BUD", "2025-01", "DE"), get(r, "BUD", "2025-01", "FR")], [201, 203]);
  const withClear = act([{ StepType: "ALLOCATE", Filter: { VERSION: ["BUD"], REGION: ["US"] }, TargetDim: "REGION", TargetMembers: ["DE", "FR"], TgtVersion: "BUD", ClearSource: true }]);
  r = Engine.run(model, data.concat([fact("BUD", "2026-05", "US", 40)]), withClear, {}, { versions });
  assert.strictEqual(get(r, "BUD", "2026-05", "US"), undefined);
  assert.strictEqual(get(r, "BUD", "2026-05", "DE"), 20);
});

test("scale, delete, inactive step, locked version stops the whole run", () => {
  const action = act([
    { StepType: "SCALE", Filter: { VERSION: ["BUD"] }, Factor: 3 },
    { StepType: "DELETE", Filter: { VERSION: ["ACT"], REGION: ["US"] }, Active: false },
    { StepType: "DELETE", Filter: { VERSION: ["BUD"] } }]);
  let r = Engine.run(model, base, action, {}, { versions });
  assert.strictEqual(r.status, "S");
  assert.strictEqual(r.steps[1].message, "Skipped (not active)");
  assert.ok(!r.facts.some((f) => f.VersionId === "BUD"));
  assert.strictEqual(r.steps[2].deleted, 1);
  const bad = act([{ StepType: "SCALE", Filter: { VERSION: ["BUD"] }, Factor: 2 }, { StepType: "SCALE", Filter: { VERSION: ["ACT"] }, Factor: 2 }]);
  r = Engine.run(model, base, bad, {}, { versions });
  assert.strictEqual(r.status, "E");
  assert.match(r.error, /locked/);
  assert.strictEqual(Engine.diff(base, r.facts).upserts.length, 0);   // nothing to write after an error
  assert.ok(Number.isNaN(Number("x")) && Engine.run(model, base, act([{ StepType: "SCALE", Factor: "@Nope" }]), {}, { versions }).status === "E");
});

test("embedded data action with its own parameters; run filter narrows every step", () => {
  const child = act([{ StepType: "COPY", Filter: { VERSION: ["ACT"], REGION: ["@R"] }, Rules: [{ Dim: "VERSION", From: "ACT", To: "FCT" }, { Dim: "PERIOD", From: "2025", To: "2026" }], Factor: "@F" }],
    { Id: "CHILD", Name: "Child", Parameters: [{ Id: "R", Type: "MEMBER", DimId: "REGION" }, { Id: "F", Type: "NUMBER", Default: 1 }] });
  const parent = act([{ StepType: "EMBED", ActionId: "CHILD", ParamMap: { R: "@Where", F: 10 } }], { Id: "PARENT", Name: "Parent", Parameters: [{ Id: "Where", Type: "MEMBER", DimId: "REGION", Default: ["DE"] }] });
  const ctx = { versions, actions: new Map([["CHILD", child], ["PARENT", parent]]) };
  let r = Engine.run(model, base, parent, {}, ctx);
  assert.strictEqual(get(r, "FCT", "2026-01", "DE"), 1000);
  assert.ok(!r.facts.some((f) => f.VersionId === "FCT" && f.Dim1 === "US"));
  assert.ok(/Parent > Child/.test(r.steps.map((s) => s.name).join()) || r.steps.length === 2);
  r = Engine.run(model, base, parent, { Values: { Where: ["US"] }, Filter: { PERIOD: ["2025-01"] } }, ctx);
  assert.deepStrictEqual(r.facts.filter((f) => f.VersionId === "FCT").map((f) => [f.Dim1, f.Period, f.Value]), [["US", "2026-01", 500]]);
});

test("legacy steps are upgraded; validation reports what is wrong", () => {
  const legacy = Schema.normalizeAction({ Id: "L", ModelId: "M", Name: "L", Steps: [{ StepNo: 10, StepType: "COPY", SrcVersion: "ACT", TgtVersion: "FCT", Filter: {}, Factor: 1 },
    { StepNo: 20, StepType: "SCALE", TgtVersion: "FCT", Filter: { PERIOD: ["2025-01"] }, Factor: 1.5 }] });
  assert.deepStrictEqual(legacy.Steps[0].Filter, { VERSION: ["ACT"] });
  assert.deepStrictEqual(legacy.Steps[0].Rules, [{ Dim: "VERSION", From: "", To: "FCT" }]);
  assert.deepStrictEqual(legacy.Steps[1].Filter, { PERIOD: ["2025-01"], VERSION: ["FCT"] });
  assert.strictEqual(legacy.Steps[0].Name, "Copy 1");

  const ctx = { model, versions, actions: [] };
  const msgs = (a) => Schema.validate(Schema.normalizeAction(a), ctx).map((x) => x.severity + ": " + x.message);
  assert.deepStrictEqual(msgs(legacy), []);
  const bad = act([{ StepType: "COPY", Filter: { NOPE: ["x"], REGION: ["@Missing"] }, Rules: [{ Dim: "VERSION", From: "ACT", To: "ACT" }], Factor: "abc" },
    { StepType: "ALLOCATE", TargetDim: "REGION", TargetMembers: [], TgtVersion: "ZZZ", Driver: "REFERENCE" },
    { StepType: "EMBED", ActionId: "A" }, { StepType: "DELETE" }], { Name: " ", Parameters: [{ Id: "1bad", Type: "MEMBER" }, { Id: "Unused", Type: "NUMBER", Default: "x" }] });
  const out = msgs(bad).join("\n");
  for (const re of [/needs a name/, /Parameter 1bad/, /Unused: the default is not a number/, /unknown dimension NOPE/, /parameter @Missing does not exist/, /target: version ACT is locked/, /factor is not a number/,
    /members to allocate to/, /version ZZZ does not exist/, /reference version/, /cannot embed itself|does not exist/, /deletes every fact/, /Parameter Unused is not used/]) { assert.match(out, re); }
  const loop = [{ Id: "A", ModelId: "M", Name: "A", Steps: [{ StepType: "EMBED", ActionId: "B" }] }, { Id: "B", ModelId: "M", Name: "B", Steps: [{ StepType: "EMBED", ActionId: "A" }] }];
  assert.ok(Schema.validate(Schema.normalizeAction(loop[0]), { model, versions, actions: loop.map(Schema.normalizeAction) }).some((x) => /loop/.test(x.message)));
  assert.deepStrictEqual(Schema.usage(Schema.normalizeAction(act([{ StepType: "SCALE", Factor: "@U" }], { Parameters: [{ Id: "U", Type: "NUMBER" }] }))), { U: ["Scale 1"] });
});
