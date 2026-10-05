/**
 * Parent/child hierarchies of a dimension (pure).
 *
 * dimension.Hierarchies = [{ Id, Label, Parents: { childId: parentId } }]. A member without a parent is a root; every member
 * of the dimension takes part (members that are not placed in the hierarchy stay roots). Members seen in facts but missing from
 * the master data are treated as roots too, so no number is lost.
 */
sap.ui.define([], function () {
  "use strict";

  const idOf = (m) => (typeof m === "string" ? m : m.Id);

  /** @returns {{id, label, roots, order, depth(id), parent(id), children(id), path(id), isLeaf(id)}} */
  function build(dimension, hierarchyId) {
    const def = ((dimension && dimension.Hierarchies) || []).find((h) => h.Id === hierarchyId);
    const members = ((dimension && dimension.Members) || []).map(idOf);
    const known = new Set(members);
    const parents = new Map();
    const children = new Map();
    const parentsDef = (def && def.Parents) || {};
    members.forEach((id) => { children.set(id, []); });
    members.forEach((id) => {
      const p = parentsDef[id];
      if (p && known.has(p) && p !== id) { parents.set(id, p); children.get(p).push(id); }
    });
    const roots = members.filter((id) => !parents.has(id));
    const order = [];
    const depth = new Map();
    const walk = (id, d, seen) => {
      if (seen.has(id)) { return; }          // a cycle never reaches here for validated models; stay safe anyway
      seen.add(id);
      order.push(id);
      depth.set(id, d);
      (children.get(id) || []).forEach((c) => walk(c, d + 1, seen));
    };
    const seen = new Set();
    roots.forEach((r) => walk(r, 1, seen));
    members.forEach((id) => { if (!seen.has(id)) { walk(id, 1, seen); } });   // members caught in a cycle
    const path = (id) => {
      const out = [];
      let cur = id;
      const guard = new Set();
      while (cur !== undefined && !guard.has(cur)) { guard.add(cur); out.unshift(cur); cur = parents.get(cur); }
      return out;
    };
    return {
      id: hierarchyId, label: def ? def.Label : hierarchyId, roots, order,
      depth: (id) => depth.get(id) || 1,
      parent: (id) => parents.get(id),
      children: (id) => (children.get(id) || []).slice(),
      isLeaf: (id) => !(children.get(id) || []).length,
      path,
      position: (id) => { const i = order.indexOf(id); return i < 0 ? order.length : i; },
      descendants(id) { const out = []; (children.get(id) || []).forEach((c) => { out.push(c); out.push.apply(out, this.descendants(c)); }); return out; }
    };
  }

  /** @returns {string[]} what is wrong with the hierarchies of a dimension */
  function validate(dimension) {
    const problems = [];
    const ids = new Set(((dimension.Members) || []).map(idOf));
    const names = new Set();
    (dimension.Hierarchies || []).forEach((h) => {
      if (!h.Id || !/^[A-Za-z0-9_]+$/.test(h.Id)) { problems.push("Dimension " + dimension.DimId + ": hierarchy ids use letters, digits and underscore"); }
      if (names.has(h.Id)) { problems.push("Dimension " + dimension.DimId + ": hierarchy " + h.Id + " is defined twice"); }
      names.add(h.Id);
      Object.keys(h.Parents || {}).forEach((child) => {
        const parent = h.Parents[child];
        if (!parent) { return; }
        if (!ids.has(child)) { problems.push(h.Id + ": " + child + " is not a member"); }
        if (!ids.has(parent)) { problems.push(h.Id + ": parent " + parent + " of " + child + " is not a member"); }
        if (parent === child) { problems.push(h.Id + ": " + child + " is its own parent"); }
      });
      // cycles: walking up from any member must end
      ids.forEach((start) => {
        const seen = new Set();
        let cur = start;
        while (cur && !seen.has(cur)) { seen.add(cur); cur = (h.Parents || {})[cur]; }
        if (cur && cur === start) { problems.push(h.Id + ": " + start + " is part of a cycle"); }
      });
    });
    return Array.from(new Set(problems));
  }

  return { build, validate, idOf };
});
