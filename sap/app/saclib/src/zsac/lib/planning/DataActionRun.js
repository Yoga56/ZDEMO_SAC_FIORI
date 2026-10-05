/**
 * Running a data action from the UI.
 *
 *   DataActionRun.open({ provider, actionId, values, onDone })   dialog: asks for the parameters of the action, "Preview" traces the
 *                                                                steps without writing, "Run" writes; the result is shown as a trace
 *   DataActionRun.paramControls(action, model, versions, values) { box, values }   the parameter inputs on their own (trigger widget)
 *   DataActionRun.traceView(result)                              one card per step: counts and sample values
 *   DataActionRun.memberItems(model, versions, dimId)            [{Id, Text}] for a dimension, incl. Version and Date
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/VBox", "sap/m/HBox", "sap/m/Text", "sap/m/Label", "sap/m/Title", "sap/m/ObjectStatus",
  "sap/m/MultiComboBox", "sap/m/Select", "sap/m/Input", "sap/m/MessageBox", "sap/m/MessageStrip", "sap/ui/core/Item", "sap/ui/core/Icon",
  "./DataActionSchema", "./MultiActionSchema", "../core/HierarchyEngine"
], function (Dialog, Button, VBox, HBox, Text, Label, Title, ObjectStatus, MultiComboBox, Select, Input, MessageBox, MessageStrip, Item, Icon, Schema, MultiSchema, HierarchyEngine) {
  "use strict";

  function memberItems(model, versions, dimId) {
    if (dimId === "PERIOD") { return HierarchyEngine.monthRange(model.PeriodFrom, model.PeriodTo).map((p) => ({ Id: p, Text: p })); }
    if (dimId === "VERSION") { return (versions || []).map((v) => ({ Id: v.VersionId, Text: v.Name })); }
    if (dimId === "MEASURE") { return (model.Measures || []).map((m) => ({ Id: m.MeasureId, Text: m.Label || m.MeasureId })); }
    const d = (model.Dimensions || []).find((x) => x.DimId === dimId);
    return d ? (d.Members || []) : [];
  }
  const itemText = (m) => m.Id + (m.Text && m.Text !== m.Id ? " – " + m.Text : "");

  /** Inputs for the declared parameters. `values` is filled with the defaults and follows what the planner enters. */
  function paramControls(action, model, versions, preset, lookup) {
    const norm = Schema.normalizeAction(action);
    const values = Schema.resolveValues(norm, preset);
    const box = new VBox({ width: "100%" });
    norm.Parameters.forEach((p) => {
      box.addItem(new Label({ text: p.Prompt || p.Id }));
      if (p.Type === "NUMBER") {
        box.addItem(new Input({ type: "Number", value: String(values[p.Id]), width: "100%", liveChange: (e) => { values[p.Id] = Number(e.getParameter("value")); } }).addStyleClass("sapUiTinyMarginBottom"));
        return;
      }
      const src = lookup ? lookup(p) : { model, versions };
      const members = src && src.model ? memberItems(src.model, src.versions, p.DimId) : [];
      if (p.Multi) {
        const c = new MultiComboBox({ width: "100%", placeholder: "All", selectionFinish: (e) => { values[p.Id] = e.getParameter("selectedItems").map((i) => i.getKey()); } });
        members.forEach((m) => c.addItem(new Item({ key: m.Id, text: itemText(m) })));
        c.setSelectedKeys(values[p.Id]);
        box.addItem(c.addStyleClass("sapUiTinyMarginBottom"));
      } else {
        const c = new Select({ width: "100%", forceSelection: false, change: (e) => { values[p.Id] = [e.getParameter("selectedItem").getKey()]; } });
        members.forEach((m) => c.addItem(new Item({ key: m.Id, text: itemText(m) })));
        c.setSelectedKey((values[p.Id] || [])[0] || "");
        box.addItem(c.addStyleClass("sapUiTinyMarginBottom"));
      }
    });
    return { box, values, count: norm.Parameters.length };
  }

  const TYPE_ICON = { COPY: "sap-icon://duplicate", ALLOCATE: "sap-icon://share-2", SCALE: "sap-icon://measure", DELETE: "sap-icon://delete", EMBED: "sap-icon://workflow-tasks" };

  function stepCard(s) {
    const failed = s.message && /fail|error|locked|not found/i.test(s.message) && !s.touched;
    const head = new HBox({ alignItems: "Center", items: [
      new Icon({ src: TYPE_ICON[s.type] || "sap-icon://action", size: "1rem" }).addStyleClass("sapUiTinyMarginEnd"),
      new Title({ text: s.no / 10 + ". " + s.name, level: "H6" }) ] });
    const kids = [head];
    if (!s.active) {
      kids.push(new ObjectStatus({ text: "Inactive, skipped", state: "None" }));
    } else {
      kids.push(new HBox({ wrap: "Wrap", items: [
        new ObjectStatus({ text: s.created + " created", state: s.created ? "Success" : "None" }).addStyleClass("sapUiSmallMarginEnd"),
        new ObjectStatus({ text: s.updated + " updated", state: s.updated ? "Warning" : "None" }).addStyleClass("sapUiSmallMarginEnd"),
        new ObjectStatus({ text: s.deleted + " deleted", state: s.deleted ? "Error" : "None" }) ] }));
      if (s.message) { kids.push(new Text({ text: s.message }).addStyleClass("zsacSmall")); }
      (s.samples || []).slice(0, 4).forEach((x) => {
        kids.push(new Text({ text: x.key + ":  " + (x.old === null || x.old === undefined ? "(none)" : x.old) + "  →  " + (x.new === null || x.new === undefined ? "(deleted)" : x.new) }).addStyleClass("zsacSmall"));
      });
    }
    return new VBox({ items: kids }).addStyleClass("zsacTraceCard" + (failed ? " zsacTraceFailed" : ""));
  }

  function traceView(result) {
    const box = new VBox({ width: "100%" });
    if (!result) { return box; }
    box.addItem(new MessageStrip({
      type: result.Status === "S" ? (result.DryRun ? "Information" : "Success") : "Error", showIcon: true,
      text: result.Status === "S"
        ? (result.DryRun ? "Preview, nothing was written. " : "") + result.Changed + " values " + (result.DryRun ? "would change" : "changed")
        : "Failed, no values were written: " + result.Error }).addStyleClass("sapUiTinyMarginBottom"));
    (result.Steps || []).forEach((s) => box.addItem(stepCard(s)));
    return box;
  }

  function open(opts) {
    const { provider } = opts;
    const fail = (e) => MessageBox.error((e && e.message) || String(e));
    Promise.all([provider.getDataAction(opts.actionId), provider.listDataActions()]).then(async ([action]) => {
      const [model, versions] = await Promise.all([provider.getModel(action.ModelId), provider.listVersions(action.ModelId)]);
      const pc = paramControls(action, model, versions, opts.values);
      const result = new VBox({ width: "100%" });
      const content = new VBox({ width: "26rem", items: [
        pc.count ? pc.box : new Text({ text: "This data action has no parameters." }).addStyleClass("sapUiSmallMarginBottom"), result] }).addStyleClass("sapUiSmallMargin");
      const go = async (dry) => {
        run.setEnabled(false); preview.setEnabled(false);
        try {
          const r = await provider.executeDataAction(action.Id, { Values: pc.values, Filter: opts.filter || {} }, { dryRun: dry });
          result.destroyItems(); result.addItem(traceView(r));
          if (!dry && opts.onDone) { opts.onDone(r); }
        } catch (e) {
          result.destroyItems(); result.addItem(traceView(e.result || { Status: "E", Error: e.message, Steps: [] }));
          if (!dry && opts.onDone) { opts.onDone(null, e); }
        }
        run.setEnabled(true); preview.setEnabled(true);
      };
      const preview = new Button({ text: "Preview", icon: "sap-icon://inspection", press: () => go(true) });
      const run = new Button({ text: "Run", type: "Emphasized", icon: "sap-icon://play", press: () => go(false) });
      const dlg = new Dialog({ title: (opts.previewOnly ? "Trace " : "Run ") + action.Name, content: [content], contentHeight: "auto", buttons: [preview].concat(opts.previewOnly ? [] : [run]).concat([new Button({ text: "Close", press: () => dlg.close() })]),
        afterClose: () => dlg.destroy() });
      dlg.open();
    }).catch(fail);
  }

  /** Run dialog of a multi action: its parameters, then the log and the steps. */
  function openMulti(opts) {
    const { provider } = opts;
    const fail = (e) => MessageBox.error((e && e.message) || String(e));
    Promise.all([provider.getMultiAction(opts.actionId), provider.listModels(), provider.listVersions()]).then(([action, models, versions]) => {
      const norm = MultiSchema.normalizeAction(action);
      const lookup = (p) => ({ model: models.find((m) => m.ModelId === p.ModelId), versions: versions.filter((v) => v.ModelId === p.ModelId) });
      const pc = paramControls({ Parameters: norm.Parameters }, null, null, opts.values, lookup);
      const result = new VBox({ width: "100%" });
      const content = new VBox({ width: "26rem", items: [
        pc.count ? pc.box : new Text({ text: "This multi action has no parameters." }).addStyleClass("sapUiSmallMarginBottom"), result] }).addStyleClass("sapUiSmallMargin");
      const run = new Button({ text: "Run", type: "Emphasized", icon: "sap-icon://play", press: async () => {
        run.setEnabled(false);
        try {
          const r = await provider.runMultiAction(action.Id, { Values: pc.values });
          result.destroyItems();
          result.addItem(new MessageStrip({ type: r.Status === "S" ? "Success" : "Error", showIcon: true, text: r.Status === "S" ? "Done, " + r.Changed + " values changed by data actions" : "Stopped at a failing step" }).addStyleClass("sapUiTinyMarginBottom"));
          (r.Steps || []).forEach((st, i) => result.addItem(new VBox({ items: [new Title({ text: (i + 1) + ". " + st.name, level: "H6" }), new Text({ text: st.message || "" }).addStyleClass("zsacSmall")] }).addStyleClass("zsacTraceCard" + (/^Failed/.test(st.message) ? " zsacTraceFailed" : ""))));
          if (opts.onDone) { opts.onDone(r); }
        } catch (e) { fail(e); }
        run.setEnabled(true);
      } });
      const dlg = new Dialog({ title: "Run " + action.Name, content: [content], buttons: [run, new Button({ text: "Close", press: () => dlg.close() })], afterClose: () => dlg.destroy() });
      dlg.open();
    }).catch(fail);
  }

  return { open, openMulti, paramControls, traceView, memberItems };
});
