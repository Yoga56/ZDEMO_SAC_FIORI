/**
 * Data Locking (SAC's Data Locking page, here a dialog): the lock regions of a model and the state of data outside them.
 *
 *   LockDialog.open({ provider, modelId, onChange })
 *
 * A region is a slice of the data (a filter on versions, periods and dimension members) that is Open, Restricted to owners or Locked
 * (see LockEngine). Only people who may edit the model change regions; others see them. Saving writes the model.
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/ui/core/Item", "sap/m/Label", "sap/m/Text", "sap/m/VBox", "sap/m/HBox",
  "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/ScrollContainer", "sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/HTML",
  "../designer/FilterEditor",
  "./LockEngine"
], function (Dialog, Button, Input, Select, Item, Label, Text, VBox, HBox, Table, Column, ColumnListItem, ScrollContainer, MessageBox, MessageToast, HTML, FilterEditor, LockEngine) {
  "use strict";

  const chip = (state) => '<span class="zsacLockChip zsacLockChip' + state + '">' + LockEngine.STATES[state].label + "</span>";

  async function open(opts) {
    const provider = opts.provider;
    const model = await provider.getModel(opts.modelId);
    const versions = await provider.listVersions(opts.modelId);
    const canEdit = model.Access !== "READ" && !!model.DataLocking;
    let regions = LockEngine.normalize(model.LockRegions);
    let def = model.LockDefault || "OPEN";
    const fail = (e) => MessageBox.error((e && e.message) || String(e));

    const table = new Table({ noDataText: "No regions. All data has the default state.", columns: [
      new Column({ header: new Text({ text: "Region" }) }), new Column({ header: new Text({ text: "Data" }), minScreenWidth: "Tablet", demandPopin: true }),
      new Column({ header: new Text({ text: "State" }), width: "7rem" }), new Column({ header: new Text({ text: "Owners" }), minScreenWidth: "Tablet", demandPopin: true }),
      new Column({ header: new Text({ text: "" }), width: "6rem" })] });
    const defaultSelect = new Select({ width: "11rem", enabled: canEdit, selectedKey: def, change: () => { def = defaultSelect.getSelectedKey(); } });
    ["OPEN", "LOCKED"].forEach((k) => defaultSelect.addItem(new Item({ key: k, text: LockEngine.STATES[k].label })));

    function render() {
      table.destroyItems();
      regions.forEach((r, i) => {
        table.addItem(new ColumnListItem({ cells: [
          new Text({ text: r.Name }), new Text({ text: LockEngine.describeFilter(model, r.Filter) }), new HTML({ content: "<div>" + chip(r.State) + "</div>" }),
          new Text({ text: r.State === "RESTRICTED" ? r.Owners.join(", ") : "" }),
          new HBox({ items: [
            new Button({ icon: "sap-icon://edit", type: "Transparent", tooltip: canEdit ? "Edit" : "Show", press: () => edit(i) }),
            new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Delete", visible: canEdit, press: () => { regions.splice(i, 1); render(); } })] })] }));
      });
    }

    function edit(index) {
      const isNew = index < 0;
      const r = isNew ? { Id: "", Name: "", State: "LOCKED", Owners: [], Filter: {} } : JSON.parse(JSON.stringify(regions[index]));
      const name = new Input({ value: r.Name, width: "100%", enabled: canEdit, placeholder: "For example Q1 closed" });
      const state = new Select({ width: "100%", enabled: canEdit, selectedKey: r.State, change: () => { owners.setEnabled(canEdit && state.getSelectedKey() === "RESTRICTED"); } });
      Object.keys(LockEngine.STATES).forEach((k) => state.addItem(new Item({ key: k, text: LockEngine.STATES[k].label })));
      const owners = new Input({ value: r.Owners.join(", "), width: "100%", enabled: canEdit && r.State === "RESTRICTED", placeholder: "User names, separated by commas" });
      const holder = new VBox({ width: "100%" });
      holder.addItem(FilterEditor.build({ model, versions, filters: r.Filter, periodNodes: true, onChange: (f) => { r.Filter = f; } }));
      const dlg = new Dialog({
        title: isNew ? "New region" : r.Name, contentWidth: "28rem",
        content: [new VBox({ width: "100%", items: [
          new Label({ text: "Name", required: true }), name, new Label({ text: "State" }).addStyleClass("sapUiSmallMarginTop"), state,
          new Label({ text: "Owners (who can change a restricted region)" }).addStyleClass("sapUiSmallMarginTop"), owners,
          new Label({ text: "The data in this region (empty = everything)", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"),
          new ScrollContainer({ height: "18rem", vertical: true, content: [holder] })] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: canEdit ? "OK" : "Close", type: "Emphasized", press: () => {
          if (!canEdit) { dlg.close(); return; }
          const next = Object.assign(r, { Name: name.getValue().trim(), State: state.getSelectedKey(), Owners: owners.getValue() });
          next.Id = next.Id || "R" + Date.now().toString(36).toUpperCase();
          const list = regions.slice();
          const cleaned = LockEngine.normalize([next])[0];
          if (isNew) { list.push(cleaned); } else { list[index] = cleaned; }
          const errors = LockEngine.validate(model, list);
          if (errors.length) { MessageBox.error(errors.join("\n")); return; }
          regions = list;
          render();
          dlg.close();
        } }),
        endButton: canEdit ? new Button({ text: "Cancel", press: () => dlg.close() }) : undefined,
        afterClose: () => dlg.destroy()
      });
      dlg.open();
    }

    const dlg = new Dialog({
      title: "Data Locking · " + model.Name, contentWidth: "52rem",
      content: [new VBox({ width: "100%", items: [
        new Text({ text: model.DataLocking ? "Regions decide who can change which numbers. Where regions overlap the strictest rule applies; private versions are not locked."
          : "Data Locking is off for this model. Switch it on in the Modeller (Model tab, Planning Capabilities)." }),
        new HBox({ alignItems: "Center", class: "sapUiSmallMarginTop", items: [new Label({ text: "Data outside every region is" }).addStyleClass("sapUiTinyMarginEnd"), defaultSelect] }),
        new Toolbar_(canEdit, () => edit(-1)),
        table] }).addStyleClass("sapUiSmallMargin")],
      beginButton: canEdit ? new Button({ text: "Save", type: "Emphasized", press: async () => {
        try {
          const errors = LockEngine.validate(model, regions);
          if (errors.length) { throw new Error(errors.join("\n")); }
          await provider.saveModel(Object.assign({}, model, { LockRegions: regions, LockDefault: def }));
          MessageToast.show("Data locking saved");
          dlg.close();
          if (opts.onChange) { await opts.onChange(); }
        } catch (e) { fail(e); }
      } }) : undefined,
      endButton: new Button({ text: canEdit ? "Cancel" : "Close", press: () => dlg.close() }),
      afterClose: () => dlg.destroy()
    });
    render();
    dlg.open();
  }

  // the "Add region" button row
  function Toolbar_(canEdit, add) {
    return new HBox({ width: "100%", justifyContent: "End", class: "sapUiTinyMarginTopBottom", items: [new Button({ text: "Add region", icon: "sap-icon://add", visible: canEdit, press: add })] });
  }

  return { open };
});
