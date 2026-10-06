const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const Access = req("zsac/lib/core/Access");

const shares = [{ Principal: "BOB", Access: "READ" }, { Principal: "CARL", Access: "WRITE" }];

test("access level: owner, shared users, everyone, and no access", () => {
  assert.strictEqual(Access.level("ALICE", "ALICE", []), "OWNER");
  assert.strictEqual(Access.level("alice", "ALICE", []), "OWNER"); // user names are not case sensitive
  assert.strictEqual(Access.level("BOB", "ALICE", shares), "READ");
  assert.strictEqual(Access.level("CARL", "ALICE", shares), "WRITE");
  assert.strictEqual(Access.level("DAN", "ALICE", shares), "NONE");
  assert.strictEqual(Access.level("DAN", "ALICE", shares.concat([{ Principal: "*", Access: "READ" }])), "READ");
  assert.strictEqual(Access.level("CARL", "ALICE", shares.concat([{ Principal: "*", Access: "READ" }])), "WRITE"); // the stronger one counts
  assert.strictEqual(Access.level("", "ALICE", shares.concat([{ Principal: "*", Access: "WRITE" }])), "WRITE"); // unknown user: only what everyone has
  assert.strictEqual(Access.level("", "ALICE", shares), "NONE");
  assert.strictEqual(Access.level("BOB", "ALICE", [{ Principal: "BOB", Access: "OWNER" }]), "NONE"); // a share can never make someone owner
});

test("access level: content without an owner is open to everyone", () => {
  ["", undefined, null, "*"].forEach((o) => assert.strictEqual(Access.level("BOB", o, []), "WRITE"));
  assert.strictEqual(Access.can("WRITE", "share", true), false); // nobody owns it, so nobody can share it
  assert.strictEqual(Access.can("WRITE", "delete", true), true); // but anyone may remove it, as before
  assert.strictEqual(Access.can("WRITE", "delete", false), false);
});

test("access can: what each level may do", () => {
  const table = { OWNER: [1, 1, 1, 1, 1], WRITE: [1, 1, 1, 0, 0], READ: [1, 1, 0, 0, 0], NONE: [0, 0, 0, 0, 0] };
  Object.keys(table).forEach((lvl) => ["read", "use", "edit", "delete", "share"].forEach((a, i) => assert.strictEqual(Access.can(lvl, a), !!table[lvl][i], lvl + " " + a)));
  assert.throws(() => Access.can("OWNER", "launch"), /Unknown action/);
});

test("access normalize: names tidied, strongest access kept, the owner and bad rows dropped with a reason", () => {
  const r = Access.normalize([
    { Principal: " bob ", Access: "READ" }, { Principal: "BOB", Access: "WRITE" }, { Principal: "alice", Access: "READ" },
    { Principal: "*", Access: "READ" }, { Principal: "bad name!", Access: "READ" }, { Principal: "DAN", Access: "ADMIN" }, { Principal: "", Access: "READ" }, { Principal: "ERIC", Access: "READ" }
  ], "ALICE");
  assert.deepStrictEqual(r.shares, [{ Principal: "*", Access: "READ" }, { Principal: "BOB", Access: "WRITE" }, { Principal: "ERIC", Access: "READ" }]);
  assert.strictEqual(r.errors.length, 2);
  assert.match(r.errors.join("\n"), /not a user name/); assert.match(r.errors.join("\n"), /DAN must be READ or WRITE/);
  assert.deepStrictEqual(Access.normalize(null, "A").shares, []);
  assert.strictEqual(Access.normalize([{ Principal: "ABCDEFGHIJKLM", Access: "READ" }], "A").errors.length, 1); // 13 characters is too long for a user name
});
