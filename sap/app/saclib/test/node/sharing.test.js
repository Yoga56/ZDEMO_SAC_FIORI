const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const req = require("./loader");

const MockProvider = req("zsac/lib/provider/MockProvider");
const dir = path.resolve(__dirname, "../../src/zsac/lib/provider/mockdata");
const seed = {};
["models", "facts", "versions", "stories", "dataactions", "multiactions", "files", "tasks", "comments", "shares"].forEach((n) => {
  const f = path.join(dir, n + ".json");
  seed[n] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
});
const story = (id, extra) => Object.assign({ Id: id, Name: "Story " + id, Description: "", ModelId: "SALES_PLAN", Pages: [{ Id: 1, Title: "P" }], Widgets: [], Filters: {} }, extra);
const rejects = async (promise, re) => { await assert.rejects(promise, (e) => re.test(e.message)); };
function users() {
  const alice = new MockProvider({ seed, persist: false, user: "ALICE" });
  return { alice, bob: alice.asUser("BOB"), carl: alice.asUser("CARL") };
}

test("sharing: a new story belongs to the user who saved it and nobody else sees it", async () => {
  const { alice, bob } = users();
  const saved = await alice.saveStory(story("S_A"));
  assert.strictEqual(saved.Owner, "ALICE"); assert.strictEqual(saved.Access, "OWNER");
  assert.ok((await alice.listStories()).some((s) => s.Id === "S_A"));
  assert.ok(!(await bob.listStories()).some((s) => s.Id === "S_A"));
  await rejects(bob.getStory("S_A"), /not allowed to open the story S_A \(owner ALICE\)/);
  assert.ok(!(await bob.listFiles()).some((f) => f.ObjectId === "S_A")); // its entry in Files is hidden too
  assert.ok((await alice.listFiles()).some((f) => f.ObjectId === "S_A" && f.Owner === "ALICE"));
});

test("sharing: view access opens it, edit access changes it, nobody but the owner deletes or shares", async () => {
  const { alice, bob, carl } = users();
  await alice.saveStory(story("S_B"));
  assert.deepStrictEqual(await alice.saveShares("STORY", "S_B", [{ Principal: "bob", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }]), [{ Principal: "BOB", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }]);
  assert.strictEqual((await bob.getStory("S_B")).Access, "READ");
  assert.ok((await bob.listStories()).some((s) => s.Id === "S_B"));
  await rejects(bob.saveStory(Object.assign(await bob.getStory("S_B"), { Name: "Hacked" })), /not allowed to change the story/);
  await rejects(bob.deleteStory("S_B"), /not allowed to delete/);
  const edited = await carl.saveStory(Object.assign(await carl.getStory("S_B"), { Name: "By Carl" }));
  assert.strictEqual(edited.Name, "By Carl"); assert.strictEqual(edited.Owner, "ALICE"); // editing never moves the ownership
  await rejects(carl.deleteStory("S_B"), /not allowed to delete/);
  await rejects(carl.saveShares("STORY", "S_B", []), /Only the owner \(ALICE\)/);
  await rejects(bob.saveShares("STORY", "S_B", [{ Principal: "BOB", Access: "WRITE" }]), /Only the owner/);
  // a user cannot escalate by sending an owner or an access with the story
  const sneaky = await carl.saveStory(Object.assign(await carl.getStory("S_B"), { Owner: "CARL", Access: "OWNER" }));
  assert.strictEqual(sneaky.Owner, "ALICE");
  assert.strictEqual((await alice.getStory("S_B")).Owner, "ALICE");
});

test("sharing: everyone, the file's shared flag, what a sharee can see of the shares, and removing access", async () => {
  const { alice, bob, carl } = users();
  await alice.saveStory(story("S_C"));
  await alice.saveShares("STORY", "S_C", [{ Principal: "*", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }]);
  assert.strictEqual((await bob.getStory("S_C")).Access, "READ"); // everyone
  assert.strictEqual((await carl.getStory("S_C")).Access, "WRITE");
  assert.strictEqual((await alice.listFiles()).find((f) => f.ObjectId === "S_C").Shared, true);
  assert.strictEqual((await alice.listShares("STORY", "S_C")).length, 2);
  assert.deepStrictEqual((await bob.listShares("STORY", "S_C")).map((x) => x.Principal), ["*"]); // BOB does not learn that CARL has edit access
  await alice.saveShares("STORY", "S_C", []);
  await rejects(bob.getStory("S_C"), /not allowed to open/);
  assert.strictEqual((await alice.listFiles()).find((f) => f.ObjectId === "S_C").Shared, false);
  await rejects(alice.saveShares("STORY", "S_C", [{ Principal: "no good", Access: "READ" }]), /not a user name/);
  await rejects(alice.saveShares("STORY", "NOPE", []), /Not found/);
});

test("sharing: deleting by the owner removes the shares too", async () => {
  const { alice, bob } = users();
  await alice.saveStory(story("S_D"));
  await alice.saveShares("STORY", "S_D", [{ Principal: "BOB", Access: "READ" }]);
  await alice.deleteStory("S_D");
  assert.deepStrictEqual(seed.shares.concat(alice._db.shares).filter((x) => x.ObjectId === "S_D"), []);
  await rejects(bob.getStory("S_D"), /not found/);
});

test("sharing models: view lets a user read the data, edit lets them write it, the others are refused", async () => {
  const { alice, bob, carl } = users();
  const base = await alice.getModel("SALES_PLAN"); // sample content has no owner: open
  assert.strictEqual(base.Access, "WRITE");
  await rejects(alice.saveShares("MODEL", "SALES_PLAN", []), /no owner/);
  const mine = await alice.saveModel(Object.assign({}, base, { ModelId: "M_ALICE", Name: "Alice model" }));
  assert.strictEqual(mine.Owner, "ALICE");
  await alice.writeFacts("M_ALICE", [{ VersionId: "BUD", Period: "2026-01", Measure: "REVENUE", Dim1: "EMEA", Value: 5 }]);
  await rejects(bob.getModel("M_ALICE"), /not allowed to open the model/);
  await rejects(bob.readFacts("M_ALICE", {}), /not allowed to open/);
  assert.ok(!(await bob.listModels()).some((m) => m.ModelId === "M_ALICE"));
  await alice.saveShares("MODEL", "M_ALICE", [{ Principal: "BOB", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }]);
  assert.strictEqual((await bob.readFacts("M_ALICE", {})).length, 1);
  await rejects(bob.writeFacts("M_ALICE", [{ VersionId: "BUD", Period: "2026-02", Measure: "REVENUE", Dim1: "EMEA", Value: 9 }]), /not allowed to change the data/);
  await rejects(bob.deleteFacts("M_ALICE", [{ VersionId: "BUD", Period: "2026-01", Measure: "REVENUE", Dim1: "EMEA" }]), /not allowed to change the data/);
  await carl.writeFacts("M_ALICE", [{ VersionId: "BUD", Period: "2026-02", Measure: "REVENUE", Dim1: "EMEA", Value: 9 }]);
  assert.strictEqual((await alice.readFacts("M_ALICE", {})).length, 2);
  await rejects(carl.deleteModel("M_ALICE"), /not allowed to delete/);
  await alice.deleteModel("M_ALICE");
  assert.ok(!alice._db.shares.some((x) => x.ObjectId === "M_ALICE"));
});

test("sharing: owner-less (sample) content stays open: anyone edits and deletes it", async () => {
  const { alice, bob } = users();
  const s = await bob.getStory("STORY_OPEX");
  assert.strictEqual(s.Access, "WRITE");
  await bob.saveStory(Object.assign(s, { Name: "Renamed by Bob" }));
  assert.strictEqual((await alice.getStory("STORY_OPEX")).Name, "Renamed by Bob");
  await alice.deleteStory("STORY_OPEX"); // removing open content works as before
  await rejects(bob.getStory("STORY_OPEX"), /not found/);
});

test("accessOf and currentUser follow the provider's user", async () => {
  const { alice, bob } = users();
  assert.strictEqual(await alice.currentUser(), "ALICE");
  await alice.saveStory(story("S_E"));
  await alice.saveShares("STORY", "S_E", [{ Principal: "BOB", Access: "WRITE" }]);
  assert.strictEqual(await alice.accessOf("STORY", await alice.getStory("S_E")), "OWNER");
  assert.strictEqual(await bob.accessOf("STORY", await bob.getStory("S_E")), "WRITE");
  assert.strictEqual(await bob.accessOf("STORY", { Id: "x", Owner: "" }), "WRITE");
});

const dataAction = (id, extra) => Object.assign({ Id: id, ModelId: "SALES_PLAN", Name: "Action " + id, Description: "", Parameters: [], Steps: [] }, extra);
const multiAction = (id, extra) => Object.assign({ Id: id, Name: "Multi " + id, Description: "", Parameters: [], Steps: [] }, extra);

test("sharing data actions: owner, view to run, edit to change, owner to delete and share", async () => {
  const { alice, bob, carl } = users();
  const saved = await alice.saveDataAction(dataAction("DA_A"));
  assert.strictEqual(saved.Owner, "ALICE"); assert.strictEqual(saved.Access, "OWNER");
  assert.ok(!(await bob.listDataActions()).some((a) => a.Id === "DA_A"));
  await rejects(bob.getDataAction("DA_A"), /not allowed to open the data action DA_A \(owner ALICE\)/);
  assert.ok(!(await bob.listFiles()).some((f) => f.ObjectId === "DA_A"));
  await alice.saveShares("DATAACTION", "DA_A", [{ Principal: "BOB", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }]);
  assert.strictEqual((await bob.getDataAction("DA_A")).Access, "READ");
  assert.ok((await bob.listFiles()).some((f) => f.ObjectId === "DA_A"));
  await rejects(bob.saveDataAction(Object.assign(await bob.getDataAction("DA_A"), { Name: "Hacked" })), /not allowed to change the data action/);
  const edited = await carl.saveDataAction(Object.assign(await carl.getDataAction("DA_A"), { Name: "By Carl", Owner: "CARL" }));
  assert.strictEqual(edited.Name, "By Carl"); assert.strictEqual(edited.Owner, "ALICE");
  await rejects(carl.deleteDataAction("DA_A"), /not allowed to delete/);
  await rejects(carl.saveShares("DATAACTION", "DA_A", []), /Only the owner/);
  await alice.deleteDataAction("DA_A");
  assert.ok(!alice._db.shares.some((x) => x.ObjectId === "DA_A"));
});

test("sharing multi actions: the same rules, and a copy of a shared action belongs to whoever copies it", async () => {
  const { alice, bob } = users();
  await alice.saveMultiAction(multiAction("MA_A"));
  await rejects(bob.getMultiAction("MA_A"), /not allowed to open the multi action/);
  await alice.saveShares("MULTIACTION", "MA_A", [{ Principal: "*", Access: "READ" }]);
  const seen = await bob.getMultiAction("MA_A");
  assert.strictEqual(seen.Access, "READ");
  await rejects(bob.saveMultiAction(seen), /not allowed to change the multi action/);
  await rejects(bob.deleteMultiAction("MA_A"), /not allowed to delete/);
  const copy = await bob.saveMultiAction(Object.assign({}, seen, { Id: "MA_COPY", Name: "My copy" }));
  assert.strictEqual(copy.Owner, "BOB"); assert.strictEqual(copy.Access, "OWNER");
  assert.strictEqual((await alice.listMultiActions()).some((a) => a.Id === "MA_COPY"), false);
});

test("sharing: the sample actions have no owner and stay open; getShareable reads any kind", async () => {
  const { alice, bob } = users();
  const sample = (await alice.listDataActions())[0];
  assert.strictEqual((await bob.getDataAction(sample.Id)).Access, "WRITE");
  await rejects(alice.saveShares("DATAACTION", sample.Id, []), /no owner/);
  assert.strictEqual((await alice.getShareable("DATAACTION", sample.Id)).Id, sample.Id);
  assert.strictEqual((await alice.getShareable("MODEL", "SALES_PLAN")).ModelId, "SALES_PLAN");
  await rejects(alice.getShareable("FOLDER", "x"), /Cannot share a FOLDER/);
});

test("sharing: a user who may only view a data action runs it, but cannot write to a model they may not edit", async () => {
  const { alice, bob } = users();
  const model = await alice.saveModel(Object.assign({}, await alice.getModel("SALES_PLAN"), { ModelId: "M_RUN", Name: "Run model" }));
  assert.strictEqual(model.Owner, "ALICE");
  const rows = [{ VersionId: "BUD", Period: "2026-01", Measure: "REVENUE", Dim1: "EMEA", Dim2: "Cloud ERP", Dim3: "Direct", Value: 10 }];
  await alice.writeFacts("M_RUN", rows);
  await alice.saveDataAction(dataAction("DA_RUN", { ModelId: "M_RUN" }));
  await alice.saveShares("DATAACTION", "DA_RUN", [{ Principal: "BOB", Access: "READ" }]);
  await alice.saveShares("MODEL", "M_RUN", [{ Principal: "BOB", Access: "READ" }]);
  assert.strictEqual((await bob.getDataAction("DA_RUN")).Access, "READ");
  assert.strictEqual((await bob.readFacts("M_RUN", {})).length, 1); // the data is readable
  await rejects(bob.writeFacts("M_RUN", rows), /not allowed to change the data of the model/); // an action's write stops at the model
});

test("sharing: the run history of an action the user cannot open is not shown", async () => {
  const { alice, bob } = users();
  await alice.saveDataAction(dataAction("DA_H", { Steps: [] }));
  await alice._putRun({ Kind: "DATA", ActionId: "DA_H", ActionName: "Action DA_H", ModelId: "SALES_PLAN", Status: "S", Changed: 0, DurationMs: 1, Log: [], Steps: [] });
  assert.ok((await alice.listRuns(null, 50)).some((r) => r.ActionId === "DA_H"));
  assert.ok(!(await bob.listRuns(null, 50)).some((r) => r.ActionId === "DA_H"));
  await alice.saveShares("DATAACTION", "DA_H", [{ Principal: "BOB", Access: "READ" }]);
  assert.ok((await bob.listRuns(null, 50)).some((r) => r.ActionId === "DA_H"));
});

const CalendarEngine = req("zsac/lib/calendar/CalendarEngine");
const event = (id, extra) => Object.assign({ Id: id, Type: "GENERAL", Title: "Event " + id, Status: "OPEN", StartDate: "2026-10-01", EndDate: "2026-10-05", People: { Owners: [], Assignees: [], Viewers: [] } }, extra);

test("calendar events: private to their creator until the people on them are shared", async () => {
  const { alice, bob, carl } = users();
  const saved = await alice.saveTask(CalendarEngine.toRecord(event("EV1")));
  assert.deepStrictEqual([saved.Owner, saved.Access], ["ALICE", "OWNER"]);
  assert.ok(!(await bob.listTasks()).some((t) => t.Id === "EV1"));
  await rejects(bob.getTask("EV1"), /not allowed to open the calendar event EV1/);
  const ev = event("EV1", { People: { Owners: [], Assignees: ["bob"], Viewers: ["CARL"] } });
  await alice.saveShares("CALEVENT", "EV1", CalendarEngine.sharesOf(ev));
  assert.strictEqual((await bob.getTask("EV1")).Access, "WRITE"); // an assignee may edit it (progress, status)
  assert.strictEqual((await carl.getTask("EV1")).Access, "READ");
  const done = await bob.saveTask(CalendarEngine.toRecord(Object.assign({}, ev, { Status: "DONE", Progress: 100 })));
  assert.deepStrictEqual([done.Status, done.Owner], ["DONE", "ALICE"]);
  await rejects(carl.saveTask(CalendarEngine.toRecord(ev)), /not allowed to change the calendar event/);
  await rejects(bob.deleteTask("EV1"), /not allowed to delete/);
  await rejects(bob.saveShares("CALEVENT", "EV1", []), /Only the owner/);
  await alice.deleteTask("EV1");
  assert.ok(!alice._db.shares.some((x) => x.ObjectId === "EV1"));
  assert.ok(!(await alice.listTasks()).some((t) => t.Id === "EV1"));
});

test("calendar events: the sample events have no owner and stay open; everyone can view with *", async () => {
  const { alice, bob } = users();
  const first = (await bob.listTasks())[0];
  assert.strictEqual(first.Access, "WRITE");
  await rejects(alice.saveShares("CALEVENT", first.Id, []), /no owner/);
  await alice.saveTask(CalendarEngine.toRecord(event("EV2")));
  await alice.saveShares("CALEVENT", "EV2", CalendarEngine.sharesOf(event("EV2", { People: { Viewers: ["*"] } })));
  assert.strictEqual((await bob.getTask("EV2")).Access, "READ");
  assert.strictEqual((await alice.getShareable("CALEVENT", "EV2")).Id, "EV2");
});
