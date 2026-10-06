/**
 * Table Functions: how the planning table shows its numbers (sorting, hiding zero rows, scale and decimals, variance to another
 * version, thresholds, swapping rows and columns). The settings change the view only, never the data (see GridView).
 *
 *   TableFunctionsDialog.open(grid, { onApply(view) })
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/ui/core/Item", "sap/m/CheckBox", "sap/m/Label", "sap/m/Text", "sap/m/VBox", "sap/m/HBox",
  "sap/m/ScrollContainer", "sap/m/Title",
  "./GridView"
], function (Dialog, Button, Input, Select, Item, CheckBox, Label, Text, VBox, HBox, ScrollContainer, Title, GridView) {
  "use strict";

  const colKey = (k) => k.join("\u0001");

  function open(grid, opts) {
    const view = grid.getView();
    const columns = grid.getColumnChoices();
    const references = grid.getReferenceVersions();
    const rules = view.thresholds.map((t) => Object.assign({}, t));

    const swap = new CheckBox({ text: "Swap rows and columns", selected: view.swap });
    const zero = new CheckBox({ text: "Hide rows where every value is zero or empty", selected: view.suppressZero });

    const sortCol = new Select({ width: "100%" });
    sortCol.addItem(new Item({ key: "", text: "No sorting" }));
    columns.forEach((c) => sortCol.addItem(new Item({ key: colKey(c.key), text: c.label })));
    sortCol.setSelectedKey(view.sort ? colKey(view.sort.col) : "");
    const sortDir = new Select({ width: "100%", items: [new Item({ key: "asc", text: "Ascending" }), new Item({ key: "desc", text: "Descending" })], selectedKey: view.sort ? view.sort.dir : "desc" });

    const scale = new Select({ width: "100%", selectedKey: String(view.scale), items: [
      new Item({ key: "1", text: "None" }), new Item({ key: "1000", text: "Thousands (K)" }), new Item({ key: "1000000", text: "Millions (M)" }), new Item({ key: "1000000000", text: "Billions (B)" })] });
    const decimals = new Input({ width: "100%", type: "Number", placeholder: "From the measure", value: view.decimals >= 0 ? String(view.decimals) : "" });

    const vs = new Select({ width: "100%", enabled: references.length > 0 });
    vs.addItem(new Item({ key: "", text: references.length ? "No variance" : "Needs a table on one version" }));
    references.forEach((v) => vs.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
    vs.setSelectedKey(view.variance ? view.variance.vs : "");
    const mode = new Select({ width: "100%", selectedKey: view.variance ? view.variance.mode : "ABS", items: Object.keys(GridView.MODES).map((k) => new Item({ key: k, text: GridView.MODES[k] })) });

    const ruleBox = new VBox({ width: "100%" });
    function renderRules() {
      ruleBox.destroyItems();
      rules.forEach((r, i) => {
        const op = new Select({ width: "7.5rem", selectedKey: r.Op, change: () => { r.Op = op.getSelectedKey(); renderRules(); }, items: Object.keys(GridView.OPS).map((k) => new Item({ key: k, text: GridView.OPS[k] })) });
        const v1 = new Input({ width: "5rem", type: "Number", value: String(r.Value === undefined ? "" : r.Value), liveChange: () => { r.Value = v1.getValue(); } });
        const v2 = new Input({ width: "5rem", type: "Number", visible: r.Op === "between", value: String(r.Value2 === undefined ? "" : r.Value2), liveChange: () => { r.Value2 = v2.getValue(); } });
        const lvl = new Select({ width: "6.5rem", selectedKey: r.Level, change: () => { r.Level = lvl.getSelectedKey(); }, items: Object.keys(GridView.LEVELS).map((k) => new Item({ key: k, text: GridView.LEVELS[k] })) });
        ruleBox.addItem(new HBox({ alignItems: "Center", class: "sapUiTinyMarginBottom", items: [
          new Text({ text: "Values" }).addStyleClass("sapUiTinyMarginEnd"), op.addStyleClass("sapUiTinyMarginEnd"), v1.addStyleClass("sapUiTinyMarginEnd"), v2.addStyleClass("sapUiTinyMarginEnd"),
          new Text({ text: "are" }).addStyleClass("sapUiTinyMarginEnd"), lvl, new Button({ icon: "sap-icon://delete", type: "Transparent", press: () => { rules.splice(i, 1); renderRules(); } })] }));
      });
    }
    renderRules();

    const section = (title) => new Title({ text: title, level: "H5" }).addStyleClass("sapUiSmallMarginTop");
    const dlg = new Dialog({
      title: "Table Functions", contentWidth: "30rem", contentHeight: "34rem",
      content: [new ScrollContainer({ width: "100%", height: "100%", vertical: true, content: [new VBox({ width: "100%", items: [
        section("Layout"), swap, zero,
        section("Sort rows by"), sortCol, sortDir,
        section("Numbers"), new Label({ text: "Scale" }), scale, new Label({ text: "Decimals" }), decimals,
        new Text({ text: "Typing into a scaled table means the scaled number: 1.5 in thousands plans 1,500." }).addStyleClass("zsacSmall"),
        section("Variance"), new Label({ text: "Show the difference to version" }), vs, mode,
        section("Thresholds"), new Text({ text: "The first rule that matches colours the cell." }).addStyleClass("zsacSmall"), ruleBox,
        new Button({ text: "Add threshold", icon: "sap-icon://add", press: () => { rules.push({ Op: "<", Value: "0", Level: "BAD" }); renderRules(); } })
      ] }).addStyleClass("sapUiSmallMargin")] })],
      buttons: [new Button({ text: "Apply", type: "Emphasized", press: () => {
        const next = GridView.normalize({
          swap: swap.getSelected(), suppressZero: zero.getSelected(),
          sort: sortCol.getSelectedKey() ? { col: (columns.find((c) => colKey(c.key) === sortCol.getSelectedKey()) || { key: [] }).key, dir: sortDir.getSelectedKey() } : null,
          scale: Number(scale.getSelectedKey()), decimals: decimals.getValue(),
          variance: vs.getSelectedKey() ? { vs: vs.getSelectedKey(), mode: mode.getSelectedKey() } : null, thresholds: rules
        });
        grid.setView(next);
        if (opts && opts.onApply) { opts.onApply(next); }
        dlg.close();
      } }),
      new Button({ text: "Reset", press: () => { const v = GridView.normalize({}); grid.setView(v); if (opts && opts.onApply) { opts.onApply(v); } dlg.close(); } }),
      new Button({ text: "Cancel", press: () => dlg.close() })],
      afterClose: () => dlg.destroy()
    });
    dlg.open();
  }

  return { open };
});
