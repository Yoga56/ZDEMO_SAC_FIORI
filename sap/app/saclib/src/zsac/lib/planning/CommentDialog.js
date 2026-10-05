/**
 * Comments on one plan cell: the ones it has (author, time, delete) and a field for a new one.
 *   CommentDialog.open({ provider, coords, label, comments, onChange })
 *     coords   the cell (PlanGrid.cellCoords); label  a text naming the cell; comments  the comments of the cell now;
 *     onChange(list) runs after a comment was added or deleted with the comments of the whole model
 */
sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/TextArea", "sap/m/Text", "sap/m/VBox", "sap/m/HBox", "sap/m/List", "sap/m/CustomListItem", "sap/m/MessageBox"
], function (Dialog, Button, TextArea, Text, VBox, HBox, List, CustomListItem, MessageBox) {
  "use strict";

  function open(opts) {
    const { provider, coords } = opts;
    let own = opts.comments || [];
    const fail = (e) => MessageBox.error((e && e.message) || String(e));
    const list = new List({ noDataText: "No comments on this cell yet.", showSeparators: "Inner" });
    const input = new TextArea({ rows: 3, width: "100%", placeholder: "Write a comment ..." });

    const reload = async () => {
      const all = await provider.listComments(coords.ModelId);
      own = all.filter((c) => c.VersionId === coords.VersionId && (c.Period || "") === (coords.Period || "") && c.Measure === coords.Measure
        && Object.keys(coords.Dims).every((d) => (c.Dims || {})[d] === coords.Dims[d]) && Object.keys(c.Dims || {}).every((d) => coords.Dims[d] === c.Dims[d]));
      render();
      if (opts.onChange) { opts.onChange(all); }
    };

    function render() {
      list.destroyItems();
      own.slice().sort((a, b) => String(a.At).localeCompare(String(b.At))).forEach((c) => {
        list.addItem(new CustomListItem({ content: [new HBox({ alignItems: "Start", justifyContent: "SpaceBetween", items: [
          new VBox({ items: [new Text({ text: c.Text }), new Text({ text: (c.Author || "") + (c.At ? " · " + new Date(c.At).toLocaleString() : "") }).addStyleClass("zsacSmall")] }).addStyleClass("sapUiTinyMargin"),
          new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Delete comment", press: () => provider.deleteComment(c.Id).then(reload).catch(fail) })] })] }));
      });
    }
    render();

    const dlg = new Dialog({ title: "Comments", contentWidth: "28rem",
      content: [new VBox({ items: [new Text({ text: opts.label || "" }).addStyleClass("zsacSmall sapUiSmallMarginBottom"), list, input] }).addStyleClass("sapUiSmallMargin")],
      beginButton: new Button({ text: "Add comment", type: "Emphasized", press: () => {
        const text = input.getValue().trim();
        if (!text) { input.setValueState("Error"); return; }
        input.setValueState("None");
        provider.saveComment({ Id: "C" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36), ModelId: coords.ModelId, VersionId: coords.VersionId,
          Period: coords.Period || "", Measure: coords.Measure, Dims: coords.Dims, Text: text }).then(() => { input.setValue(""); return reload(); }).catch(fail);
      } }),
      endButton: new Button({ text: "Close", press: () => dlg.close() }), afterClose: () => dlg.destroy() });
    dlg.open();
  }

  return { open };
});
