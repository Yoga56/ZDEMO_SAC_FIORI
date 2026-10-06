/**
 * Who may do what with a story or a model (pure). Every object has an owner; the owner can share it with named users or with
 * everyone, for reading or for editing.
 *
 *   level   OWNER > WRITE (edit) > READ (open and use) > NONE
 *   open    an object without an owner (older content, the sample data, "*") belongs to nobody and is open to everyone to read and edit;
 *           it cannot be shared because there is nobody to decide
 *
 *   Access.level(user, owner, shares) -> "OWNER" | "WRITE" | "READ" | "NONE"
 *   Access.can(level, action, open) -> boolean    actions: read, use, edit, delete, share; open: the object has no owner (anyone may delete it)
 *   Access.normalize(shares, owner) -> { shares, errors }   the list to store: valid principals, one row each, strongest access, no row for the owner
 *   Access.EVERYONE -> "*"
 */
sap.ui.define([], function () {
  "use strict";

  const EVERYONE = "*";
  const RANK = { NONE: 0, READ: 1, WRITE: 2, OWNER: 3 };
  const NEEDS = { read: "READ", use: "READ", edit: "WRITE", delete: "OWNER", share: "OWNER" };
  const PRINCIPAL = /^[A-Z0-9_.@$-]{1,12}$/; // a user name as the ABAP system has it: up to 12 characters

  const isOpen = (owner) => !owner || owner === EVERYONE;

  function level(user, owner, shares) {
    if (isOpen(owner)) { return "WRITE"; }
    const me = String(user || "").toUpperCase();
    if (me && String(owner).toUpperCase() === me) { return "OWNER"; }
    let best = "NONE";
    (shares || []).forEach((s) => {
      if ((s.Principal === EVERYONE || (me && String(s.Principal).toUpperCase() === me)) && RANK[s.Access] > RANK[best] && s.Access !== "OWNER") { best = s.Access; }
    });
    return best;
  }

  /** open = the object has no owner: everyone may also delete it (it is nobody's to protect), but not share it. */
  function can(lvl, action, open) {
    if (!Object.prototype.hasOwnProperty.call(NEEDS, action)) { throw new Error("Unknown action " + action); }
    if (open && action === "delete") { return true; }
    return RANK[lvl] >= RANK[NEEDS[action]];
  }

  function normalize(shares, owner) {
    const errors = []; const best = new Map();
    (shares || []).forEach((s) => {
      const p = String(s.Principal === undefined || s.Principal === null ? "" : s.Principal).trim().toUpperCase();
      if (!p) { return; }
      if (p !== EVERYONE && !PRINCIPAL.test(p)) { errors.push("'" + s.Principal + "' is not a user name (up to 12 letters, digits and _ . @ -)"); return; }
      if (s.Access !== "READ" && s.Access !== "WRITE") { errors.push("Access for " + p + " must be READ or WRITE"); return; }
      if (p !== EVERYONE && owner && p === String(owner).toUpperCase()) { return; } // the owner has everything already
      if (!best.has(p) || RANK[s.Access] > RANK[best.get(p)]) { best.set(p, s.Access); }
    });
    return { shares: Array.from(best.entries()).map(([Principal, Access]) => ({ Principal, Access })).sort((a, b) => (a.Principal === EVERYONE ? -1 : b.Principal === EVERYONE ? 1 : a.Principal.localeCompare(b.Principal))), errors };
  }

  const LABEL = { OWNER: "Owner", WRITE: "Can edit", READ: "Can view", NONE: "No access" };

  return { level, can, normalize, isOpen, EVERYONE, RANK, LABEL };
});
