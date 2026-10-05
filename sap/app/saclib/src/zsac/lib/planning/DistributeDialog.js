/**
 * Distribute Values: enter a value and split it over the selected cells of a planning grid, equally, in proportion to their current
 * values, or in proportion to the same cells in another version (for example last year's actuals as the seasonal pattern).
 * Cells that cannot be planned (locked version, ...) are left out.
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/RadioButton", "sap/m/RadioButtonGroup", "sap/m/Select", "sap/ui/core/Item",
  "sap/m/CheckBox", "sap/m/Text", "sap/m/Label", "sap/m/VBox", "sap/m/MessageToast", "sap/m/MessageBox",
  "./Distributor"
], function (Dialog, Button, Input, RadioButton, RadioButtonGroup, Select, Item, CheckBox, Text, Label, VBox, MessageToast, MessageBox, Distributor) {
  "use strict";

  function open(grid) {
    const cells = grid.getSelectedCells();
    const editable = cells.filter((c) => c.state.editable);
    if (!editable.length) {
      MessageToast.show(cells.length ? (cells[0].state.reason || "These cells cannot be planned") : "Select cells first: click one, then shift+click another");
      return;
    }
    const current = editable.reduce((a, c) => a + (c.value || 0), 0);
    const f = Math.pow(10, grid.getDecimals());
    const total = new Input({ value: String(Math.round(current * f) / f), width: "100%", type: "Number" });
    const references = grid.getReferenceVersions();
    const reference = new Select({ width: "100%", enabled: false });
    references.forEach((v) => reference.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
    const method = new RadioButtonGroup({ columns: 1, selectedIndex: 0, select: (e) => reference.setEnabled(e.getParameter("selectedIndex") === 2) });
    method.addButton(new RadioButton({ text: "Equally" }));
    method.addButton(new RadioButton({ text: "Proportionally to the current values" }));
    method.addButton(new RadioButton({ text: "Proportionally to another version", enabled: references.length > 0 }));
    const onlyEmpty = new CheckBox({ text: "Only cells that are empty or zero" });

    const dlg = new Dialog({
      title: "Distribute Values",
      content: [new VBox({ width: "26rem", items: [
        new Text({ text: editable.length + " of " + cells.length + " selected cells can be planned. Select cells of the same level: a total and the numbers below it in one block overwrite each other." }),
        new Label({ text: "Value to distribute", required: true }).addStyleClass("sapUiSmallMarginTop"), total,
        new Label({ text: "Distribute" }).addStyleClass("sapUiSmallMarginTop"), method, reference,
        onlyEmpty
      ] }).addStyleClass("sapUiSmallMargin")],
      beginButton: new Button({ text: "Distribute", type: "Emphasized", press: async () => {
        try {
          const value = Number(total.getValue());
          if (!Number.isFinite(value)) { throw new Error("Enter the value to distribute"); }
          const kind = ["EQUAL", "PROPORTIONAL", "REFERENCE"][method.getSelectedIndex()];
          const weights = kind === "REFERENCE" ? await grid.getReferenceValues(reference.getSelectedKey(), editable) : [];
          const shares = Distributor.distribute(editable.map((c, i) => ({ value: c.value, weight: weights[i] })), value, { method: kind, onlyEmpty: onlyEmpty.getSelected(), decimals: grid.getDecimals() });
          const items = editable.map((c, i) => ({ ri: c.ri, ci: c.ci, value: shares[i] })).filter((x) => x.value !== null);
          if (!items.length) { throw new Error("No cell to fill: every selected cell already has a value"); }
          const out = grid.applyCellValues(items);
          dlg.close();
          MessageToast.show(out.cells + " cells changed" + (out.skipped ? ", " + out.skipped + " skipped" : ""));
        } catch (e) {
          MessageBox.error(e.message || String(e));
        }
      } }),
      endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
      afterClose: () => dlg.destroy()
    });
    dlg.open();
  }

  return { open };
});
