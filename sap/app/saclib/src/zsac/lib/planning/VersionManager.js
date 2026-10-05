/**
 * Version Management (SAC's Tools > Version Management): the public and private versions of a model with
 * create, rename, details, copy as private version, lock and unlock, publish a private version, revert, delete.
 *
 *   VersionManager.open({ provider, plan, modelId, onChange, onSelect })
 *
 * Operations that read published data first ask to publish unpublished plan changes (PlanPublisher.settle).
 * onChange runs after anything changed so the page can reload; onSelect(versionId) when a version is clicked.
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/ui/core/Item", "sap/m/SearchField", "sap/m/Switch", "sap/m/Label", "sap/m/Text",
  "sap/m/VBox", "sap/m/HBox", "sap/m/Panel", "sap/m/OverflowToolbar", "sap/m/ToolbarSpacer", "sap/m/Title", "sap/m/List", "sap/m/CustomListItem",
  "sap/m/MenuButton", "sap/m/Menu", "sap/m/MenuItem", "sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Icon", "sap/m/ScrollContainer",
  "./PlanPublisher"
], function (Dialog, Button, Input, Select, Item, SearchField, Switch, Label, Text, VBox, HBox, Panel, OverflowToolbar, ToolbarSpacer, Title, List, CustomListItem,
  MenuButton, Menu, MenuItem, MessageBox, MessageToast, Icon, ScrollContainer, PlanPublisher) {
  "use strict";

  const CATEGORY = { ACTUAL: "Actual", BUDGET: "Budget", FORECAST: "Forecast", PRIVATE: "Private" };
  const ORDER = { ACTUAL: 0, BUDGET: 1, FORECAST: 2, PRIVATE: 3 };

  function open(opts) {
    const { provider, plan } = opts;
    let models = [];
    let model = null;
    let versions = [];
    let used = null;                 // version id -> {rows, range}, loaded when needed
    const fail = (e) => MessageBox.error((e && e.message) || String(e));

    const category = new Select({ width: "9rem", change: () => render(), items: [
      new Item({ key: "", text: "Show all" }), new Item({ key: "ACTUAL", text: "Actual" }), new Item({ key: "BUDGET", text: "Budget" }),
      new Item({ key: "FORECAST", text: "Forecast" }), new Item({ key: "PRIVATE", text: "Private" })] });
    const search = new SearchField({ width: "11rem", placeholder: "Search", liveChange: () => render() });
    const inUse = new Switch({ state: false, customTextOn: " ", customTextOff: " ", change: async () => { if (inUse.getState()) { await loadUsage(); } render(); } });
    const modelSelect = new Select({ width: "12rem", change: async (e) => { await load(e.getParameter("selectedItem").getKey()); } });
    const publicList = new List({ noDataText: "No public versions", showSeparators: "Inner" });
    const privateList = new List({ noDataText: "You don't have any private versions right now.", showSeparators: "Inner" });

    const changed = async () => { if (opts.onChange) { await opts.onChange(); } await load(model.ModelId, true); };

    async function loadUsage() {
      const facts = await provider.readFacts(model.ModelId, {});
      used = new Map();
      facts.forEach((f) => {
        const u = used.get(f.VersionId) || { rows: 0, periods: new Set() };
        u.rows++; u.periods.add(f.Period);
        used.set(f.VersionId, u);
      });
    }

    async function load(modelId, keepUsage) {
      models = await provider.listModels();
      model = models.find((m) => m.ModelId === modelId) || models[0];
      if (!model) { return; }
      modelSelect.destroyItems();
      models.forEach((m) => modelSelect.addItem(new Item({ key: m.ModelId, text: m.Name })));
      modelSelect.setSelectedKey(model.ModelId);
      versions = await provider.listVersions(model.ModelId);
      if (!keepUsage) { used = null; }
      if (inUse.getState()) { await loadUsage(); }
      render();
    }

    function settle(why) { return PlanPublisher.settle(plan, provider, why); }

    // ---- dialogs ---------------------------------------------------------------------------
    function form(title, rows, okText, onOk) {
      const d = new Dialog({
        title, content: [new VBox({ width: "24rem", items: rows }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: okText, type: "Emphasized", press: async () => { try { await onOk(); d.close(); } catch (e) { fail(e); } } }),
        endButton: new Button({ text: "Cancel", press: () => d.close() }), afterClose: () => d.destroy()
      });
      d.open();
    }

    function newPublic() {
      const name = new Input({ width: "100%", placeholder: "Budget 2027" });
      const id = new Input({ width: "100%", maxLength: 12, placeholder: "BUD2027" });
      let touched = false;
      id.attachLiveChange(() => { touched = true; });
      name.attachLiveChange((e) => { if (!touched) { id.setValue(e.getParameter("value").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 12)); } });
      const cat = new Select({ width: "100%", items: [new Item({ key: "BUDGET", text: "Budget" }), new Item({ key: "FORECAST", text: "Forecast" }), new Item({ key: "ACTUAL", text: "Actual" })] });
      form("Create Blank Public Version", [new Label({ text: "Version name", required: true }), name, new Label({ text: "Version ID", required: true }), id, new Label({ text: "Category" }), cat], "Create", async () => {
        const vid = id.getValue().trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9_]*$/.test(vid) || !name.getValue().trim()) { throw new Error("Enter a name and an ID (capital letters, digits and underscore)"); }
        if (versions.some((v) => v.VersionId === vid)) { throw new Error("Version " + vid + " exists"); }
        await provider.saveVersion({ ModelId: model.ModelId, VersionId: vid, Name: name.getValue().trim(), Category: cat.getSelectedKey(), Locked: cat.getSelectedKey() === "ACTUAL", Owner: "ME", SourceVersion: "", Status: "P" });
        MessageToast.show("Version " + vid + " created");
        await changed();
      });
    }

    function copyAsPrivate(source) {
      const name = new Input({ width: "100%", value: "My copy of " + source.Name });
      const from = new Select({ width: "100%" });
      versions.forEach((v) => from.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
      from.setSelectedKey(source ? source.VersionId : versions[0].VersionId);
      form("Create Private Version", [new Label({ text: "Copy of" }), from, new Label({ text: "Name", required: true }), name], "Create", async () => {
        if (!name.getValue().trim()) { throw new Error("Enter a name"); }
        if (!(await settle("A private version"))) { throw new Error("Cancelled"); }
        const v = await provider.createPrivateVersion(model.ModelId, from.getSelectedKey(), name.getValue().trim());
        MessageToast.show("Private version " + v.VersionId + " created");
        await changed();
      });
    }

    function rename(v) {
      const name = new Input({ width: "100%", value: v.Name });
      form("Rename " + v.VersionId, [new Label({ text: "Version name", required: true }), name], "Rename", async () => {
        if (!name.getValue().trim()) { throw new Error("Enter a name"); }
        await provider.saveVersion(Object.assign({}, v, { Name: name.getValue().trim() }));
        await changed();
      });
    }

    async function details(v) {
      const facts = await provider.readFacts(model.ModelId, { VERSION: [v.VersionId] });
      const periods = Array.from(new Set(facts.map((f) => f.Period))).sort();
      const rows = [["Name", v.Name], ["ID", v.VersionId], ["Category", CATEGORY[v.Category] || v.Category], ["Status", v.Locked ? "Locked" : "Open for planning"], ["Owner", v.Owner || "-"],
        ["Copy of", v.SourceVersion || "-"], ["Values", String(facts.length)], ["Periods", periods.length ? periods[0] + " to " + periods[periods.length - 1] : "-"]];
      const box = new VBox({ width: "22rem", items: rows.map(([k, val]) => new HBox({ justifyContent: "SpaceBetween", items: [new Text({ text: k }).addStyleClass("zsacSmall"), new Text({ text: val })] }).addStyleClass("sapUiTinyMarginBottom")) });
      const d = new Dialog({ title: "Details: " + v.Name, content: [box.addStyleClass("sapUiSmallMargin")], endButton: new Button({ text: "Close", press: () => d.close() }), afterClose: () => d.destroy() });
      d.open();
    }

    function publish(v) {
      const targets = versions.filter((x) => x.Category !== "PRIVATE" && !x.Locked);
      if (!targets.length) { MessageToast.show("There is no unlocked public version to publish to"); return; }
      const sel = new Select({ width: "100%" });
      targets.forEach((t) => sel.addItem(new Item({ key: t.VersionId, text: t.Name + " (" + t.VersionId + ")" })));
      sel.setSelectedKey((targets.find((t) => t.VersionId === v.SourceVersion) || targets[0]).VersionId);
      form("Publish " + v.Name, [new Text({ text: "The numbers of the target version are replaced by this version." }), new Label({ text: "Publish to" }).addStyleClass("sapUiSmallMarginTop"), sel], "Publish", async () => {
        if (!(await settle("Publishing a version"))) { throw new Error("Cancelled"); }
        const r = await provider.publishVersion(model.ModelId, v.VersionId, sel.getSelectedKey());
        MessageToast.show("Published to " + sel.getSelectedKey() + (r && r.Published ? " (" + r.Published + " values)" : ""));
        await changed();
      });
    }

    function confirmDo(text, action, fn) {
      MessageBox.confirm(text, { actions: [action, MessageBox.Action.CANCEL], emphasizedAction: action, onClose: async (a) => { if (a === action) { try { await fn(); } catch (e) { fail(e); } } } });
    }

    function remove(v) {
      if (v.Locked) { MessageBox.error("Version " + v.VersionId + " is locked. Unlock it before deleting it."); return; }
      confirmDo("Delete version " + v.Name + " and all its numbers?", "Delete", async () => {
        if (!(await settle("Deleting a version"))) { return; }
        await provider.deleteVersion(model.ModelId, v.VersionId);
        await changed();
      });
    }

    function revert(v) {
      confirmDo("Throw away the edits of " + v.Name + " and copy " + v.SourceVersion + " again?", "Revert", async () => {
        if (!(await settle("Reverting a version"))) { return; }
        await provider.revertVersion(model.ModelId, v.VersionId);
        await changed();
      });
    }

    async function toggleLock(v) {
      if (!(await settle("Locking a version"))) { return; }
      await provider.saveVersion(Object.assign({}, v, { Locked: !v.Locked }));
      MessageToast.show(v.Locked ? "Version unlocked" : "Version locked");
      await changed();
    }

    // ---- lists -----------------------------------------------------------------------------
    function item(v) {
      const priv = v.Category === "PRIVATE";
      const menu = new Menu();
      const add = (text, icon, fn) => menu.addItem(new MenuItem({ text, icon, press: () => Promise.resolve(fn()).catch(fail) }));
      add("Details", "sap-icon://hint", () => details(v));
      add("Rename", "sap-icon://edit", () => rename(v));
      if (priv) {
        add("Publish to...", "sap-icon://upload-to-cloud", () => publish(v));
        if (v.SourceVersion) { add("Revert to source", "sap-icon://undo", () => revert(v)); }
      } else {
        add("Copy as private version", "sap-icon://duplicate", () => copyAsPrivate(v));
        if (model.DataLocking) { add(v.Locked ? "Unlock" : "Lock", v.Locked ? "sap-icon://unlocked" : "sap-icon://locked", () => toggleLock(v)); }
      }
      add("Delete", "sap-icon://delete", () => remove(v));
      const sub = v.VersionId + " · " + (CATEGORY[v.Category] || v.Category) + (v.Locked ? " · locked" : "") + (priv && v.SourceVersion ? " · copy of " + v.SourceVersion : "")
        + (used && used.has(v.VersionId) ? " · " + used.get(v.VersionId).rows + " values" : "");
      return new CustomListItem({ type: opts.onSelect ? "Active" : "Inactive", press: () => { if (opts.onSelect) { opts.onSelect(v.VersionId); } }, content: [
        new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
          new HBox({ alignItems: "Center", items: [
            new Icon({ src: v.Locked ? "sap-icon://locked" : priv ? "sap-icon://person-placeholder" : "sap-icon://database" }).addStyleClass("sapUiSmallMarginEnd"),
            new VBox({ items: [new Text({ text: v.Name }).addStyleClass("sapMTitle"), new Text({ text: sub }).addStyleClass("zsacSmall")] })] }),
          new MenuButton({ icon: "sap-icon://overflow", type: "Transparent", menu, tooltip: "Actions" })] }).addStyleClass("sapUiTinyMargin")] });
    }

    function render() {
      const q = search.getValue().toLowerCase();
      const cat = category.getSelectedKey();
      const list = versions.filter((v) => (!cat || v.Category === cat) && (!q || (v.Name + " " + v.VersionId).toLowerCase().includes(q)) && (!inUse.getState() || !used || used.has(v.VersionId)))
        .sort((a, b) => (ORDER[a.Category] - ORDER[b.Category]) || a.VersionId.localeCompare(b.VersionId));
      publicList.destroyItems(); privateList.destroyItems();
      list.filter((v) => v.Category !== "PRIVATE").forEach((v) => publicList.addItem(item(v)));
      list.filter((v) => v.Category === "PRIVATE").forEach((v) => privateList.addItem(item(v)));
    }

    const panel = (title, onAdd, list) => new Panel({ expandable: true, expanded: true, headerToolbar: new OverflowToolbar({ style: "Clear", content: [new Title({ text: title, level: "H4" }), new ToolbarSpacer(),
      new Button({ icon: "sap-icon://add", type: "Transparent", tooltip: title === "Public Versions" ? "Create a blank public version" : "Create a private version", press: onAdd })] }), content: [list] });

    const dlg = new Dialog({
      title: "Version Management", contentWidth: "36rem", contentHeight: "36rem", resizable: true,
      content: [new VBox({ items: [
        new HBox({ alignItems: "Center", wrap: "Wrap", items: [modelSelect.addStyleClass("sapUiTinyMarginEnd"), category.addStyleClass("sapUiTinyMarginEnd"), search] }).addStyleClass("sapUiTinyMarginBottom"),
        new HBox({ alignItems: "Center", items: [new Text({ text: "Show only versions that hold data" }).addStyleClass("sapUiTinyMarginEnd"), inUse] }).addStyleClass("sapUiSmallMarginBottom"),
        panel("Public Versions", newPublic, publicList),
        panel("Private Versions", () => copyAsPrivate(versions.find((v) => v.Category === "BUDGET") || versions[0]), privateList)
      ] }).addStyleClass("sapUiSmallMargin")],
      endButton: new Button({ text: "Close", press: () => dlg.close() }),
      afterClose: () => dlg.destroy()
    });
    dlg.open();
    load(opts.modelId).catch(fail);
  }

  return { open };
});
