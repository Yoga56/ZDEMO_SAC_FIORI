/**
 * Bookmarks (pure): saved views of a page. A bookmark keeps what the planner chose (model, version, measure, hierarchy, comparison, table
 * functions) so one click brings it back; one bookmark can be the default that opens with the page. They are the planner's own, kept per
 * user and page in a storage the caller passes (the browser's localStorage in the app).
 *
 *   const b = Bookmarks.open(storage, key, user)
 *   b.list() -> [{ Id, Name, State, Default }]      b.save(name, state) -> bookmark (the same name replaces it)
 *   b.remove(id)    b.rename(id, name)    b.setDefault(id | "")    b.defaultOne() -> bookmark | null    b.get(id)
 *
 * storage = { getItem(key), setItem(key, text) }. A storage that throws or holds rubbish gives an empty list.
 */
sap.ui.define([], function () {
  "use strict";

  function open(storage, key, user) {
    const full = key + "." + String(user || "").toUpperCase();
    const read = () => {
      try { const v = JSON.parse(storage.getItem(full) || "[]"); return Array.isArray(v) ? v.filter((x) => x && x.Id && x.Name) : []; } catch (e) { return []; }
    };
    const write = (list) => { try { storage.setItem(full, JSON.stringify(list)); } catch (e) { /* the bookmark lives until the page closes */ } return list; };
    let cache = null;
    const all = () => { if (!cache) { cache = read(); } return cache; };
    const put = (list) => { cache = write(list); return cache; };
    const copy = (x) => JSON.parse(JSON.stringify(x));

    return {
      list() { return all().map(copy); },
      get(id) { const b = all().find((x) => x.Id === id); return b ? copy(b) : null; },
      defaultOne() { const b = all().find((x) => x.Default); return b ? copy(b) : null; },
      save(name, state) {
        const n = String(name || "").trim();
        if (!n) { throw new Error("Give the bookmark a name"); }
        const list = all().slice();
        const i = list.findIndex((x) => x.Name.toLowerCase() === n.toLowerCase());
        const b = { Id: i >= 0 ? list[i].Id : "B" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), Name: n, State: copy(state || {}), Default: i >= 0 ? !!list[i].Default : false };
        if (i >= 0) { list[i] = b; } else { list.push(b); }
        put(list);
        return copy(b);
      },
      remove(id) { put(all().filter((x) => x.Id !== id)); },
      rename(id, name) {
        const n = String(name || "").trim();
        if (!n) { throw new Error("Give the bookmark a name"); }
        if (all().some((x) => x.Id !== id && x.Name.toLowerCase() === n.toLowerCase())) { throw new Error("A bookmark called " + n + " exists"); }
        put(all().map((x) => (x.Id === id ? Object.assign({}, x, { Name: n }) : x)));
      },
      setDefault(id) { put(all().map((x) => Object.assign({}, x, { Default: !!id && x.Id === id }))); }
    };
  }

  return { open };
});
