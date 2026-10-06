/**
 * Visual editor for a value driver tree (or the target and drivers of a Compass simulation): the tree is built with lists, not typed.
 *
 *   TreeEditor.build({ text, model, uncertainty, onChange(text) }) -> sap.m.VBox
 *
 * Every node has a name and an operator (Sum, Difference, Product, Ratio, or Data). A data node reads numbers: pick its measure and, with
 * "Add filter", the members of any dimension. Under "More" a data node has a scale, the favourable direction and, for Compass, the range
 * its value can take. The tree is stored as the text of core/ValueTree, so trees written by hand open here and the other way round;
 * "Edit as text" switches to the text for people who prefer it, and is where a text with problems opens.
 */
sap.ui.define([
  "sap/ui/core/Item", "sap/ui/core/SeparatorItem",
  "sap/m/ComboBox",
  "sap/m/FlexItemData",
  "sap/m/VBox", "sap/m/HBox", "sap/m/Input", "sap/m/Select", "sap/m/MultiComboBox", "sap/m/Button", "sap/m/Text", "sap/m/TextArea", "sap/m/Panel", "sap/m/MessageStrip",
  "../core/ValueTree", "../core/ValueTreeEdit", "../core/CalcMeasures"
], function (Item, SeparatorItem, ComboBox, FlexItemData, VBox, HBox, Input, Select, MultiComboBox, Button, Text, TextArea, Panel, MessageStrip, ValueTree, Edit, CalcMeasures) {
  "use strict";

  const OPS = [["sum", "Sum of drivers"], ["diff", "First minus the others"], ["product", "Product of drivers"], ["ratio", "First divided by second"], ["leaf", "Data (from the model)"]];
  const SCALES = [["1", "None"], ["1000", "Thousands"], ["1000000", "Millions"], ["1000000000", "Billions"]];

  function build(opts) {
    const model = opts.model;
    const box = new VBox({ width: "100%" });
    let text = opts.text || "";
    let parsed = ValueTree.parse(text);
    let raw = !!text.trim() && (parsed.errors.length > 0 || !parsed.tree);
    let tree = parsed.tree;

    const commit = () => { text = ValueTree.serialize(tree); opts.onChange(text); render(); };
    const dims = ((model && model.Dimensions) || []).filter((d) => d.DimId);
    const measures = model ? CalcMeasures.all(model) : [];

    const generic = (name) => !name || /^(Driver \d+|Node|Total)$/.test(name);
    /** The names offered for a node: the measures, then the members of every dimension. A name can still be typed. */
    function nameList() {
      const out = [{ sep: "Measures" }].concat(measures.map((m) => ({ text: m.Label })));
      dims.forEach((d) => { out.push({ sep: d.Label || d.DimId }); (d.Members || []).forEach((m) => out.push({ text: m.Text || m.Id })); });
      return out;
    }
    const names = nameList();
    const memberText = (d, id) => { const dim = dims.find((x) => x.DimId === d); const m = dim && (dim.Members || []).find((x) => x.Id === id); return (m && m.Text) || id; };
    /** A data node still called "Driver 2" takes the name of what it reads. */
    const autoName = (n) => {
      if (!generic(n.label)) { return; }
      const d = Object.keys(n.filters).find((k) => n.filters[k].length);
      if (d) { n.label = n.filters[d].slice(0, 2).map((m) => memberText(d, m)).join(", ") + (n.filters[d].length > 2 ? " ..." : ""); return; }
      const m = n.measure && measures.find((x) => x.MeasureId === n.measure);
      if (m) { n.label = m.Label; }
    };

    function nodeEditor(n, path, parentOp) {
      const depth = path.length;
      const card = new VBox({ width: "100%" }).addStyleClass("zsacTreeNode");
      card.addStyleClass("zsacTreeDepth" + Math.min(depth, 4));
      const head = new VBox({ width: "100%" });
      const pos = parentOp === "ratio" ? (path[path.length - 1] === 0 ? "Numerator" : "Denominator") : parentOp === "diff" ? (path[path.length - 1] === 0 ? "Start value" : "Subtracted") : "";
      if (pos) { head.addItem(new Text({ text: pos }).addStyleClass("zsacSmall")); }
      const nameBox = new ComboBox({ value: n.label, width: "100%", placeholder: "Pick a name",
        change: (e) => { n.label = e.getParameter("value").trim() || "Node"; commit(); } });
      names.forEach((x) => nameBox.addItem(x.sep ? new SeparatorItem({ text: x.sep }) : new Item({ key: x.text, text: x.text })));
      head.addItem(nameBox);
      head.addItem(new Select({ width: "100%", selectedKey: n.op, items: OPS.map((o) => new Item({ key: o[0], text: o[1] })),
        change: (e) => { Edit.setOp(tree, path, e.getParameter("selectedItem").getKey()); commit(); } }).addStyleClass("sapUiTinyMarginTop"));
      const tools = new HBox({ alignItems: "Center", justifyContent: "End", width: "100%" });
      if (n.op !== "leaf") { tools.addItem(new Button({ icon: "sap-icon://add", type: "Transparent", tooltip: "Add a driver", press: () => { Edit.addChild(tree, path); commit(); } })); }
      if (path.length) {
        tools.addItem(new Button({ icon: "sap-icon://navigation-up-arrow", type: "Transparent", tooltip: "Move up", press: () => { Edit.move(tree, path, -1); commit(); } }));
        tools.addItem(new Button({ icon: "sap-icon://navigation-down-arrow", type: "Transparent", tooltip: "Move down", press: () => { Edit.move(tree, path, 1); commit(); } }));
        tools.addItem(new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Remove this node and its drivers", press: () => { Edit.remove(tree, path); commit(); } }));
      }
      head.addItem(tools);
      card.addItem(head);

      if (n.op === "leaf") { card.addItem(leafEditor(n)); }
      n.children.forEach((c, i) => card.addItem(nodeEditor(c, path.concat(i), n.op)));
      return card;
    }

    /** A label above its control; an optional button sits beside the control. */
    function row(label, control, button) {
      const r = new VBox({ width: "100%" }).addStyleClass("sapUiTinyMarginTop");
      r.addItem(new Text({ text: label }).addStyleClass("zsacSmall"));
      if (!button) { r.addItem(control); return r; }
      control.setLayoutData(new FlexItemData({ growFactor: 1, shrinkFactor: 1, baseSize: "0" }));
      r.addItem(new HBox({ alignItems: "Center", width: "100%", items: [control, button] }));
      return r;
    }

    function leafEditor(n) {
      const body = new VBox({ width: "100%" }).addStyleClass("zsacTreeLeaf");
      body.addItem(row("Measure", new Select({ width: "100%", selectedKey: n.measure, forceSelection: false,
        items: [new Item({ key: "", text: "The widget's measure" })].concat(measures.map((m) => new Item({ key: m.MeasureId, text: m.Label + (m.Calculated ? " (calculated)" : "") }))),
        change: (e) => { n.measure = e.getParameter("selectedItem").getKey(); autoName(n); commit(); } })));
      Object.keys(n.filters).forEach((d) => {
        const dim = dims.find((x) => x.DimId === d);
        const mc = new MultiComboBox({ width: "100%", placeholder: "Choose members", selectedKeys: n.filters[d],
          selectionFinish: (e) => { const keys = e.getParameter("selectedItems").map((i) => i.getKey()); if (keys.length) { n.filters[d] = keys; } else { delete n.filters[d]; } autoName(n); commit(); } });
        ((dim && dim.Members) || []).forEach((m) => mc.addItem(new Item({ key: m.Id, text: m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "") })));
        // members that are not in the list (typed by hand) stay selectable
        n.filters[d].filter((k) => !((dim && dim.Members) || []).some((m) => m.Id === k)).forEach((k) => mc.addItem(new Item({ key: k, text: k })));
        body.addItem(row((dim && dim.Label) || d, mc, new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove this filter", press: () => { delete n.filters[d]; commit(); } })));
      });
      const free = dims.filter((d) => !n.filters[d.DimId]);
      if (free.length) {
        body.addItem(new Select({ width: "100%", selectedKey: "", forceSelection: false,
          items: [new Item({ key: "", text: "Add filter..." })].concat(free.map((d) => new Item({ key: d.DimId, text: d.Label || d.DimId }))),
          change: (e) => { const k = e.getParameter("selectedItem").getKey(); if (k) { n.filters[k] = []; render(); } } }));
      }
      if (!Object.keys(n.filters).length) { body.addItem(new Text({ text: "No filter: this node reads all the data the widget is filtered to." }).addStyleClass("zsacSmall")); }

      const more = new VBox({ width: "100%" });
      more.addItem(row("Scale", new Select({ width: "100%", selectedKey: String(n.scale || 1), items: SCALES.map((o) => new Item({ key: o[0], text: o[1] })), change: (e) => { n.scale = Number(e.getParameter("selectedItem").getKey()); commit(); } })));
      more.addItem(row("A rise is", new Select({ width: "100%", selectedKey: n.lower === null ? "" : n.lower ? "down" : "up", items: [new Item({ key: "", text: "As the tree says" }), new Item({ key: "up", text: "Favourable" }), new Item({ key: "down", text: "Unfavourable (a cost)" })],
          change: (e) => { const k = e.getParameter("selectedItem").getKey(); n.lower = k === "" ? null : k === "down"; commit(); } })));
      if (opts.uncertainty) {
        const range = new HBox({ alignItems: "Center", width: "100%" });
        const num = (v) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
        const lo = new Input({ width: "100%", type: "Number", placeholder: "Min", value: n.range ? String(n.range.min) : "" });
        const hi = new Input({ width: "100%", type: "Number", placeholder: "Max", value: n.range ? String(n.range.max) : "" });
        const setRange = () => { const a = num(lo.getValue()); const b = num(hi.getValue()); n.range = a !== null && b !== null ? { min: a, max: b } : null; if (n.range) { n.pct = null; } commit(); };
        lo.attachChange(setRange); hi.attachChange(setRange);
        lo.setLayoutData(new FlexItemData({ growFactor: 1, baseSize: "0" })); hi.setLayoutData(new FlexItemData({ growFactor: 1, baseSize: "0" }));
        range.addItem(lo.addStyleClass("sapUiTinyMarginEnd")); range.addItem(hi);
        more.addItem(row("Range (minimum, maximum)", range));
        more.addItem(row("or plus/minus percent", new Input({ width: "100%", type: "Number", placeholder: "10", value: n.pct === null ? "" : String(n.pct), change: (e) => { n.pct = num(e.getParameter("value")); if (n.pct !== null) { n.range = null; } commit(); } })));
        more.addItem(row("Distribution", new Select({ width: "100%", selectedKey: n.dist || "", items: [new Item({ key: "", text: "Normal (default)" }), new Item({ key: "normal", text: "Normal" }), new Item({ key: "uniform", text: "Uniform" })],
          change: (e) => { n.dist = e.getParameter("selectedItem").getKey(); commit(); } })));
      }
      body.addItem(new Panel({ headerText: opts.uncertainty ? "More: scale, direction, uncertainty" : "More: scale and direction", expandable: true, expanded: false, content: [more] }).addStyleClass("zsacTreeMore"));
      return body;
    }

    function render() {
      box.destroyItems();
      if (raw) {
        parsed = ValueTree.parse(text);
        const area = new TextArea({ value: text, width: "100%", rows: 10, liveChange: (e) => { text = e.getParameter("value"); }, change: (e) => { text = e.getParameter("value"); opts.onChange(text); render(); } });
        box.addItem(area);
        if (parsed.errors.length) { box.addItem(new MessageStrip({ type: "Warning", showIcon: true, text: parsed.errors.join(" · ") }).addStyleClass("sapUiTinyMarginTop")); }
        box.addItem(new HBox({ items: [
          new Button({ text: "Back to the editor", icon: "sap-icon://edit", enabled: !parsed.errors.length && !!parsed.tree, press: () => { tree = parsed.tree; raw = false; render(); } }).addStyleClass("sapUiTinyMarginEnd"),
          new Button({ text: "Start a new tree", icon: "sap-icon://add", press: () => { tree = Edit.create("Total"); raw = false; commit(); } })] }).addStyleClass("sapUiTinyMarginTop"));
        return;
      }
      if (!tree) {
        box.addItem(new Text({ text: "No tree yet. The top node is the number everything adds up to; its drivers hang below it." }).addStyleClass("zsacSmall sapUiTinyMarginBottom"));
        box.addItem(new Button({ text: "Create a tree", icon: "sap-icon://add", type: "Emphasized", press: () => { tree = Edit.create("Total"); commit(); } }));
        return;
      }
      box.addItem(nodeEditor(tree, [], ""));
      const problems = Edit.problems(tree);
      if (problems.length) { box.addItem(new MessageStrip({ type: "Warning", showIcon: true, text: problems.join(" · ") }).addStyleClass("sapUiTinyMarginTop")); }
      box.addItem(new Button({ text: "Edit as text", icon: "sap-icon://notes", type: "Transparent", press: () => { raw = true; render(); } }).addStyleClass("sapUiTinyMarginTop"));
    }

    render();
    return box;
  }

  return { build };
});
