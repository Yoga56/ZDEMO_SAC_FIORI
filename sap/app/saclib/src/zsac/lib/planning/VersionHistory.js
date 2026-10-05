/**
 * Version History (SAC's Tools > Version History): what happened to the numbers of a version.
 *   This session   the unpublished steps of the planning session, newest first; undo (or redo) up to a step
 *   Published      the change log of the model (Data Audit), where the data source keeps one
 *
 *   VersionHistory.open({ provider, plan, modelId })
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Select", "sap/ui/core/Item", "sap/m/Text", "sap/m/VBox", "sap/m/HBox", "sap/m/List", "sap/m/CustomListItem", "sap/m/Title",
  "sap/m/IconTabBar", "sap/m/IconTabFilter", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/ScrollContainer", "sap/m/MessageBox"
], function (Dialog, Button, Select, Item, Text, VBox, HBox, List, CustomListItem, Title, IconTabBar, IconTabFilter, Table, Column, ColumnListItem, ScrollContainer, MessageBox) {
  "use strict";

  function open(opts) {
    const { provider, plan } = opts;
    let model = null;
    let versions = [];
    const version = new Select({ width: "16rem", change: () => render() });
    const session = new VBox({ width: "100%" });
    const published = new VBox({ width: "100%" });
    const fail = (e) => MessageBox.error((e && e.message) || String(e));

    const time = (at) => new Date(at).toLocaleTimeString();

    function stepItem(s, i, undone) {
      return new CustomListItem({ content: [new HBox({ alignItems: "Center", justifyContent: "SpaceBetween", items: [
        new VBox({ items: [new Text({ text: s.label }), new Text({ text: time(s.at) + " · " + s.count + " values · " + s.versions.join(", ") }).addStyleClass("zsacSmall")] }),
        new Button({ text: undone ? "Redo to here" : "Undo to here", type: "Transparent", press: () => (undone ? plan.redoTo(i) : plan.undoTo(i)) })] }).addStyleClass("sapUiTinyMargin")] });
    }

    function renderSession() {
      session.destroyItems();
      const key = version.getSelectedKey();
      const h = plan.history();
      const keep = (s) => (!model || s.models.indexOf(model.ModelId) >= 0) && (!key || s.versions.indexOf(key) >= 0);
      const undo = new List({ noDataText: "No unpublished steps. Changes you type, paste or distribute are listed here until you publish them.", showSeparators: "Inner" });
      h.undo.forEach((s, i) => { if (keep(s)) { undo.addItem(stepItem(s, i, false)); } });
      session.addItem(new Title({ text: "Steps since the last publish", level: "H5" }).addStyleClass("sapUiTinyMarginBottom"));
      session.addItem(undo);
      const redo = h.redo.map((s, i) => [s, i]).filter(([s]) => keep(s));
      if (redo.length) {
        const list = new List({ showSeparators: "Inner" });
        redo.forEach(([s, i]) => list.addItem(stepItem(s, i, true)));
        session.addItem(new Title({ text: "Undone steps", level: "H5" }).addStyleClass("sapUiSmallMarginTop sapUiTinyMarginBottom"));
        session.addItem(list);
      }
    }

    async function renderPublished() {
      published.destroyItems();
      if (!provider.capabilities.audit) { published.addItem(new Text({ text: "This data source does not keep a change history of published numbers." })); return; }
      if (!model || !model.DataAudit) { published.addItem(new Text({ text: "Data Audit is off for this model. Switch it on in the Modeller (Model tab, Preferences) to record who changed which number." })); return; }
      const key = version.getSelectedKey();
      const rows = (await provider.listAudit(model.ModelId, 300)).filter((a) => !key || a.VersionId === key);
      const table = new Table({ noDataText: "No published changes recorded yet", sticky: ["ColumnHeaders"] });
      ["When", "User", "Version", "Period", "Measure", "Members", "Old", "New"].forEach((x) => table.addColumn(new Column({ header: new Text({ text: x }), hAlign: /Old|New/.test(x) ? "End" : "Begin" })));
      rows.forEach((a) => table.addItem(new ColumnListItem({ cells: [new Text({ text: new Date(a.At).toLocaleString() }), new Text({ text: a.User }), new Text({ text: a.VersionId }), new Text({ text: a.Period }),
        new Text({ text: a.Measure }), new Text({ text: a.Dims }), new Text({ text: a.Old === null ? "(new)" : String(a.Old) }), new Text({ text: String(a.New) })] })));
      published.addItem(table);
    }

    function render() { renderSession(); renderPublished().catch(fail); }

    const onPlan = () => renderSession();
    plan.attachChange(onPlan);

    const tabs = new IconTabBar({ expandable: false, applyContentPadding: false, items: [
      new IconTabFilter({ key: "session", text: "This session", content: [new ScrollContainer({ height: "22rem", vertical: true, content: [session.addStyleClass("sapUiSmallMargin")] })] }),
      new IconTabFilter({ key: "published", text: "Published", content: [new ScrollContainer({ height: "22rem", vertical: true, horizontal: true, content: [published.addStyleClass("sapUiSmallMargin")] })] })] });

    const dlg = new Dialog({
      title: "Version History", contentWidth: "44rem", contentHeight: "32rem", resizable: true,
      content: [new VBox({ items: [new HBox({ alignItems: "Center", items: [new Text({ text: "Version" }).addStyleClass("sapUiTinyMarginEnd"), version] }).addStyleClass("sapUiSmallMargin"), tabs] })],
      endButton: new Button({ text: "Close", press: () => dlg.close() }),
      afterClose: () => { plan.detachChange(onPlan); dlg.destroy(); }
    });
    dlg.open();
    (async () => {
      const models = await provider.listModels();
      model = models.find((m) => m.ModelId === opts.modelId) || models[0];
      if (!model) { return; }
      versions = await provider.listVersions(model.ModelId);
      version.addItem(new Item({ key: "", text: "All versions" }));
      versions.forEach((v) => version.addItem(new Item({ key: v.VersionId, text: v.Name + " (" + v.VersionId + ")" })));
      version.setSelectedKey("");
      render();
    })().catch(fail);
  }

  return { open };
});
