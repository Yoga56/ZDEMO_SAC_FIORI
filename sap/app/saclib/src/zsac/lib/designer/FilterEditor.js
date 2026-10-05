/**
 * Reusable filter editor: one multi select per dimension (plus Version and Period) and a search-and-replace row
 * for the selected values. Used by the builder panel, data action steps and data action parameters.
 *
 *   FilterEditor.build({ model, versions, filters, onChange(newFilters) })  ->  sap.m.VBox
 */
sap.ui.define([
  "sap/ui/core/Item", "sap/m/VBox", "sap/m/HBox", "sap/m/Label", "sap/m/Input", "sap/m/Select", "sap/m/MultiComboBox",
  "sap/m/Button", "sap/m/Text", "../core/FilterEngine"
], function (Item, VBox, HBox, Label, Input, Select, MultiComboBox, Button, Text, FilterEngine) {
  "use strict";

  function months(from, to) {
    const out = [];
    if (!/^\d{4}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}$/.test(to || "")) { return out; }
    let y = +from.slice(0, 4); let m = +from.slice(5);
    const ey = +to.slice(0, 4); const em = +to.slice(5);
    while (y < ey || (y === ey && m <= em)) { out.push(y + "-" + String(m).padStart(2, "0")); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  function build(opts) {
    const model = opts.model;
    const box = new VBox({ width: "100%" });
    if (!model) { box.addItem(new Text({ text: "Choose a model first." })); return box; }
    let filters = JSON.parse(JSON.stringify(opts.filters || {}));
    const emit = () => opts.onChange(JSON.parse(JSON.stringify(filters)));
    const sets = [
      { id: "VERSION", label: "Version", members: (opts.versions || []).map((v) => ({ Id: v.VersionId, Text: v.Name })) },
      { id: "PERIOD", label: "Period", members: months(model.PeriodFrom, model.PeriodTo).map((p) => ({ Id: p, Text: p })) }
    ].concat(model.Dimensions.map((d) => ({ id: d.DimId, label: d.Label, members: d.Members || [] })));

    sets.forEach((s) => {
      box.addItem(new Text({ text: s.label }).addStyleClass("zsacSmall"));
      const mc = new MultiComboBox({ width: "100%", selectedKeys: filters[s.id] || [], placeholder: "All" });
      s.members.forEach((m) => mc.addItem(new Item({ key: m.Id, text: m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "") })));
      mc.attachSelectionFinish((e) => {
        const keys = e.getParameter("selectedItems").map((i) => i.getKey());
        if (keys.length) { filters[s.id] = keys; } else { delete filters[s.id]; }
        emit();
      });
      box.addItem(mc);
    });

    const dimSel = new Select({ width: "8.5rem" });
    sets.forEach((s) => dimSel.addItem(new Item({ key: s.id, text: s.label })));
    const search = new Input({ placeholder: "Search", width: "6rem" });
    const replace = new Input({ placeholder: "Replace", width: "6rem" });
    const go = new Button({ text: "Replace", press: () => {
      filters = FilterEngine.searchReplace(filters, dimSel.getSelectedKey(), search.getValue(), replace.getValue());
      emit();
      if (opts.onRebuild) { opts.onRebuild(); }
    } });
    box.addItem(new Label({ text: "Search and replace in filter values", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"));
    box.addItem(new HBox({ wrap: "Wrap", items: [dimSel, search, replace, go] }).addStyleClass("zsacReplace"));
    return box;
  }

  return { build, months };
});
