/**
 * Validation Rules: limits plan values must keep (see ValidationEngine), kept with the model.
 *
 *   RulesDialog.open({ provider, modelId, onChange })
 *
 * A rule names a measure (or all), the slice it covers, a minimum and/or a maximum, and whether breaking it is an error (the value is
 * refused) or a warning (the value is accepted and the planner is told). Only people who may edit the model change rules.
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/ui/core/Item", "sap/m/Label", "sap/m/Text", "sap/m/VBox", "sap/m/HBox",
  "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/ScrollContainer", "sap/m/MessageBox", "sap/m/MessageToast",
  "../designer/FilterEditor", "./LockEngine",
  "./ValidationEngine"
], function (Dialog, Button, Input, Select, Item, Label, Text, VBox, HBox, Table, Column, ColumnListItem, ScrollContainer, MessageBox, MessageToast, FilterEditor, LockEngine, ValidationEngine) {
  "use strict";

  async function open(opts) {
    const provider = opts.provider;
    const model = await provider.getModel(opts.modelId);
    const versions = await provider.listVersions(opts.modelId);
    const canEdit = model.Access !== "READ";
    let rules = ValidationEngine.normalize(model.ValidationRules);
    const limits = (r) => (r.Min !== null ? "min " + r.Min : "") + (r.Min !== null && r.Max !== null ? ", " : "") + (r.Max !== null ? "max " + r.Max : "");

    const table = new Table({ noDataText: "No rules.", columns: [
      new Column({ header: new Text({ text: "Rule" }) }), new Column({ header: new Text({ text: "Measure" }), minScreenWidth: "Tablet", demandPopin: true }),
      new Column({ header: new Text({ text: "Data" }), minScreenWidth: "Tablet", demandPopin: true }), new Column({ header: new Text({ text: "Limits" }) }),
      new Column({ header: new Text({ text: "If broken" }), width: "6rem" }), new Column({ header: new Text({ text: "" }), width: "6rem" })] });

    function render() {
      table.destroyItems();
      rules.forEach((r, i) => table.addItem(new ColumnListItem({ cells: [
        new Text({ text: r.Name }), new Text({ text: r.Measure || "All" }), new Text({ text: LockEngine.describeFilter(model, r.Filter) }), new Text({ text: limits(r) }),
        new Text({ text: r.Level === "ERROR" ? "Error" : "Warning" }),
        new HBox({ items: [new Button({ icon: "sap-icon://edit", type: "Transparent", press: () => edit(i) }),
          new Button({ icon: "sap-icon://delete", type: "Transparent", visible: canEdit, press: () => { rules.splice(i, 1); render(); } })] })] })));
    }

    function edit(index) {
      const isNew = index < 0;
      const r = isNew ? { Id: "", Name: "", Measure: "", Filter: {}, Min: null, Max: null, Level: "ERROR", Message: "" } : JSON.parse(JSON.stringify(rules[index]));
      const name = new Input({ value: r.Name, width: "100%", enabled: canEdit, placeholder: "For example No negative amounts" });
      const measure = new Select({ width: "100%", enabled: canEdit, selectedKey: r.Measure, items: [new Item({ key: "", text: "All measures" })].concat(model.Measures.map((m) => new Item({ key: m.MeasureId, text: m.Label }))) });
      const min = new Input({ value: r.Min === null ? "" : String(r.Min), type: "Number", width: "100%", enabled: canEdit });
      const max = new Input({ value: r.Max === null ? "" : String(r.Max), type: "Number", width: "100%", enabled: canEdit });
      const level = new Select({ width: "100%", enabled: canEdit, selectedKey: r.Level, items: [new Item({ key: "ERROR", text: "Error: refuse the value" }), new Item({ key: "WARNING", text: "Warning: accept it and tell the planner" })] });
      const msg = new Input({ value: r.Message, width: "100%", enabled: canEdit, placeholder: "Shown to the planner (optional)" });
      const holder = new VBox({ width: "100%", items: [FilterEditor.build({ model, versions, filters: r.Filter, periodNodes: true, onChange: (f) => { r.Filter = f; } })] });
      const dlg = new Dialog({
        title: isNew ? "New rule" : r.Name, contentWidth: "28rem",
        content: [new VBox({ width: "100%", items: [
          new Label({ text: "Name", required: true }), name, new Label({ text: "Measure" }).addStyleClass("sapUiSmallMarginTop"), measure,
          new Label({ text: "Minimum" }).addStyleClass("sapUiSmallMarginTop"), min, new Label({ text: "Maximum" }), max,
          new Label({ text: "If a value breaks the rule" }).addStyleClass("sapUiSmallMarginTop"), level, new Label({ text: "Message" }), msg,
          new Label({ text: "The data it covers (empty = everything)", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"),
          new ScrollContainer({ height: "14rem", vertical: true, content: [holder] })] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: canEdit ? "OK" : "Close", type: "Emphasized", press: () => {
          if (!canEdit) { dlg.close(); return; }
          const next = ValidationEngine.normalize([Object.assign(r, { Name: name.getValue().trim(), Measure: measure.getSelectedKey(), Min: min.getValue(), Max: max.getValue(), Level: level.getSelectedKey(), Message: msg.getValue().trim() })])[0];
          next.Id = r.Id || "V" + Date.now().toString(36).toUpperCase();
          const list = rules.slice();
          if (isNew) { list.push(next); } else { list[index] = next; }
          const errors = ValidationEngine.validate(model, list);
          if (errors.length) { MessageBox.error(errors.join("\n")); return; }
          rules = list;
          render();
          dlg.close();
        } }),
        endButton: canEdit ? new Button({ text: "Cancel", press: () => dlg.close() }) : undefined,
        afterClose: () => dlg.destroy()
      });
      dlg.open();
    }

    const dlg = new Dialog({
      title: "Validation Rules · " + model.Name, contentWidth: "52rem",
      content: [new VBox({ width: "100%", items: [
        new Text({ text: "Limits that plan values must keep. An error refuses the value when it is typed, pasted, written by an action or published; a warning lets it through and tells the planner. Private versions are checked when they are typed into, not when they are written by copying." }),
        new HBox({ width: "100%", justifyContent: "End", class: "sapUiTinyMarginTopBottom", items: [new Button({ text: "Add rule", icon: "sap-icon://add", visible: canEdit, press: () => edit(-1) })] }),
        table] }).addStyleClass("sapUiSmallMargin")],
      beginButton: canEdit ? new Button({ text: "Save", type: "Emphasized", press: async () => {
        try {
          const errors = ValidationEngine.validate(model, rules);
          if (errors.length) { throw new Error(errors.join("\n")); }
          await provider.saveModel(Object.assign({}, model, { ValidationRules: rules }));
          MessageToast.show("Validation rules saved");
          dlg.close();
          if (opts.onChange) { await opts.onChange(); }
        } catch (e) { MessageBox.error((e && e.message) || String(e)); }
      } }) : undefined,
      endButton: new Button({ text: canEdit ? "Cancel" : "Close", press: () => dlg.close() }),
      afterClose: () => dlg.destroy()
    });
    render();
    dlg.open();
  }

  return { open };
});
