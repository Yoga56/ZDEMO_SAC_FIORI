sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Label", "sap/m/Text", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem",
  "sap/m/ScrollContainer", "sap/m/OverflowToolbar", "sap/m/ToolbarSpacer", "sap/m/SearchField", "sap/m/TextArea", "sap/m/VBox", "sap/m/HBox", "sap/m/MessageBox",
  "zsac/lib/core/HierarchyEngine", "zsac/lib/designer/ValueHelp"
], function (Item, Dialog, Button, Input, Select, Label, Text, Table, Column, ColumnListItem, ScrollContainer, OverflowToolbar, ToolbarSpacer, SearchField, TextArea, VBox, HBox,
  MessageBox, HierarchyEngine, ValueHelp) {
  "use strict";

  const SELECT_LIMIT = 60;   // up to this many members the parent column is a select, above it a typed (validated) id

  /**
   * Master data of one dimension: members with their attributes and the parent/child hierarchies.
   * open({ dimension, lockedIds }) -> Promise<{ Members, Hierarchies } | null>   (null when cancelled)
   * Ids of members in lockedIds are fixed (facts may refer to them); everything else can be edited.
   */
  function open(opts) {
    return new Promise((resolve) => {
      const dim = JSON.parse(JSON.stringify(opts.dimension));
      const locked = new Set(opts.lockedIds || []);
      const attrs = dim.Attributes || [];
      let hierarchies = (dim.Hierarchies || []).map((h) => Object.assign({ Parents: {} }, h));
      let members = dim.Members.map((m) => Object.assign({ Props: {} }, m));
      let current = hierarchies.length ? hierarchies[0].Id : "";
      let query = "";

      const parentsOf = () => ((hierarchies.find((h) => h.Id === current) || {}).Parents) || {};
      const view = () => ({ Members: members, Hierarchies: hierarchies, DimId: dim.DimId });

      const table = new Table({ sticky: ["ColumnHeaders"], noDataText: "No members yet. Add one or paste a list." });
      const hierSelect = new Select({ width: "14rem", change: (e) => { current = e.getParameter("selectedItem").getKey(); render(); } });
      const info = new Text();

      function fillHierarchies() {
        hierSelect.destroyItems();
        hierSelect.addItem(new Item({ key: "", text: "(no hierarchy: flat list)" }));
        hierarchies.forEach((h) => hierSelect.addItem(new Item({ key: h.Id, text: h.Label || h.Id })));
        hierSelect.setSelectedKey(current);
      }

      function render() {
        table.destroyColumns();
        table.destroyItems();
        table.addColumn(new Column({ width: "16rem", header: new Text({ text: "ID" }) }));
        table.addColumn(new Column({ width: "16rem", header: new Text({ text: "Description" }) }));
        if (current) { table.addColumn(new Column({ width: "13rem", header: new Text({ text: "Parent (" + ((hierarchies.find((h) => h.Id === current) || {}).Label || current) + ")" }) })); }
        attrs.forEach((a) => table.addColumn(new Column({ width: "10rem", header: new Text({ text: a.Label || a.Id }) })));
        table.addColumn(new Column({ width: "3rem", header: new Text({ text: "" }) }));

        const h = current ? HierarchyEngine.build({ Members: members, Hierarchies: hierarchies }, current) : null;
        const ordered = h ? h.order.map((id) => members.find((m) => m.Id === id)).filter(Boolean) : members;
        const q = query.toLowerCase();
        const parents = parentsOf();
        ordered.filter((m) => !q || (m.Id + " " + m.Text).toLowerCase().includes(q)).forEach((m) => {
          const depth = h && m.Id ? h.depth(m.Id) : 1;
          const idInput = new Input({ value: m.Id, enabled: !locked.has(m.Id), width: "100%", change: (e) => {
            const oldId = m.Id;
            const next = e.getParameter("value").trim();
            if (!next || members.some((x) => x !== m && x.Id === next)) { e.getSource().setValue(oldId); MessageBox.error("Member ids must be unique and not empty"); return; }
            hierarchies.forEach((hh) => {
              const p = hh.Parents || {};
              if (oldId in p) { p[next] = p[oldId]; delete p[oldId]; }
              Object.keys(p).forEach((c) => { if (p[c] === oldId) { p[c] = next; } });
            });
            m.Id = next;
            render();
          } });
          const cells = [new HBox({ alignItems: "Center", items: [new Text({ text: "" }).setWidth((Math.max(0, depth - 1) * 1.1) + "rem"), idInput] }),
            new Input({ value: m.Text, width: "100%", change: (e) => { m.Text = e.getParameter("value"); } })];
          if (current) {
            if (members.length <= SELECT_LIMIT) {
              const banned = new Set([m.Id].concat(h ? h.descendants(m.Id) : []));
              const sel = new Select({ width: "100%", selectedKey: parents[m.Id] || "", change: (e) => { const k = e.getParameter("selectedItem").getKey(); if (k) { parents[m.Id] = k; } else { delete parents[m.Id]; } render(); } });
              sel.addItem(new Item({ key: "", text: "(root)" }));
              members.filter((x) => !banned.has(x.Id)).forEach((x) => sel.addItem(new Item({ key: x.Id, text: x.Id })));
              cells.push(sel);
            } else {
              cells.push(new Input({ value: parents[m.Id] || "", width: "100%", change: (e) => {
                const v = e.getParameter("value").trim();
                const banned = new Set([m.Id].concat(h ? h.descendants(m.Id) : []));
                if (v && (!members.some((x) => x.Id === v) || banned.has(v))) { e.getSource().setValueState("Error").setValueStateText("Not a member, or a descendant of this member"); return; }
                e.getSource().setValueState("None");
                if (v) { parents[m.Id] = v; } else { delete parents[m.Id]; }
                render();
              } }));
            }
          }
          attrs.forEach((a) => {
            const settings = { value: (m.Props || {})[a.Id] || "", width: "100%", change: (e) => { m.Props = m.Props || {}; m.Props[a.Id] = e.getParameter("value"); } };
            // a currency attribute is picked from the currency codes
            cells.push(a.Id === "CURRENCY" ? ValueHelp.input(Object.assign({ items: ValueHelp.CURRENCIES, title: "Currencies" }, settings)) : new Input(settings));
          });
          cells.push(new Button({ icon: "sap-icon://delete", type: "Transparent", enabled: !locked.has(m.Id), tooltip: "Remove member", press: () => {
            members = members.filter((x) => x !== m);
            hierarchies.forEach((hh) => { const p = hh.Parents || {}; delete p[m.Id]; Object.keys(p).forEach((c) => { if (p[c] === m.Id) { delete p[c]; } }); });
            render();
          } }));
          table.addItem(new ColumnListItem({ cells }));
        });
        info.setText(members.length + " members, " + hierarchies.length + " hierarchies");
        fillHierarchies();
      }

      const prompt = (title, fields, ok) => {
        const inputs = fields.map((f) => new Input({ value: f.value || "", placeholder: f.placeholder || "", enabled: f.enabled !== false, width: "100%" }));
        const d = new Dialog({ title, content: [new VBox({ width: "20rem", items: fields.flatMap((f, i) => [new Label({ text: f.label }), inputs[i]]) }).addStyleClass("sapUiSmallMargin")],
          beginButton: new Button({ text: "OK", type: "Emphasized", press: () => { if (ok(inputs.map((i) => i.getValue().trim())) !== false) { d.close(); } } }),
          endButton: new Button({ text: "Cancel", press: () => d.close() }), afterClose: () => d.destroy() });
        d.open();
      };

      const toolbar = new OverflowToolbar({ content: [
        hierSelect,
        new Button({ icon: "sap-icon://add", tooltip: "New hierarchy", press: () => prompt("New hierarchy", [{ label: "ID", placeholder: "GEO" }, { label: "Description" }], ([id, label]) => {
          if (!/^[A-Za-z0-9_]+$/.test(id) || hierarchies.some((x) => x.Id === id)) { MessageBox.error("Use a unique id with letters, digits and underscore"); return false; }
          hierarchies.push({ Id: id, Label: label || id, Parents: {} });
          current = id;
          render();
        }) }),
        new Button({ icon: "sap-icon://edit", tooltip: "Rename hierarchy", press: () => {
          const hh = hierarchies.find((x) => x.Id === current);
          if (hh) { prompt("Rename hierarchy", [{ label: "ID", value: hh.Id, enabled: false }, { label: "Description", value: hh.Label }], ([, label]) => { hh.Label = label || hh.Id; render(); }); }
        } }),
        new Button({ icon: "sap-icon://delete", tooltip: "Delete hierarchy", press: () => {
          if (!current) { return; }
          MessageBox.confirm("Delete hierarchy " + current + "? Widgets that use it fall back to flat members.", { onClose: (a) => {
            if (a === MessageBox.Action.OK) { hierarchies = hierarchies.filter((x) => x.Id !== current); current = hierarchies.length ? hierarchies[0].Id : ""; render(); }
          } });
        } }),
        info,
        new ToolbarSpacer(),
        new SearchField({ width: "12rem", placeholder: "Search members", liveChange: (e) => { query = e.getParameter("newValue") || ""; render(); } }),
        new Button({ icon: "sap-icon://add", text: "Member", press: () => {
          let n = members.length + 1;
          while (members.some((x) => x.Id === "NEW" + n)) { n++; }
          members.push({ Id: "NEW" + n, Text: "", Props: {} });
          render();
        } }),
        new Button({ text: "Paste list", press: () => {
          const area = new TextArea({ rows: 12, width: "100%", placeholder: "ID | Description | Parent (optional)\nEMEA | Europe | WORLD" });
          const d = new Dialog({ title: "Paste members", content: [new VBox({ width: "34rem", items: [new Text({ text: "One per line: ID | Description | Parent. Existing ids are updated, new ones added." }), area] }).addStyleClass("sapUiSmallMargin")],
            beginButton: new Button({ text: "Add", type: "Emphasized", press: () => {
              const lines = area.getValue().split("\n").map((l) => l.trim()).filter(Boolean);
              const wantsParents = lines.some((l) => l.split("|").length > 2 && l.split("|")[2].trim());
              if (wantsParents && !current) { hierarchies.push({ Id: "DEFAULT", Label: "Default", Parents: {} }); current = "DEFAULT"; }
              lines.forEach((l) => {
                const [id, text, parent] = l.split("|").map((x) => x.trim());
                if (!id) { return; }
                let m = members.find((x) => x.Id === id);
                if (!m) { m = { Id: id, Text: id, Props: {} }; members.push(m); }
                if (text) { m.Text = text; }
                if (parent && current) { parentsOf()[id] = parent; }
              });
              d.close();
              render();
            } }), endButton: new Button({ text: "Cancel", press: () => d.close() }), afterClose: () => d.destroy() });
          d.open();
        } })
      ] });

      const dlg = new Dialog({
        title: "Master data: " + (dim.Label || dim.DimId), contentWidth: "70rem", contentHeight: "34rem", resizable: true, draggable: true,
        content: [new VBox({ height: "100%", items: [toolbar, new ScrollContainer({ height: "100%", vertical: true, horizontal: true, content: [table] })] })],
        beginButton: new Button({ text: "OK", type: "Emphasized", press: () => {
          const probe = view();
          const problems = [];
          const ids = members.map((m) => m.Id);
          if (ids.some((x) => !x)) { problems.push("Every member needs an id"); }
          if (new Set(ids).size !== ids.length) { problems.push("Member ids must be unique"); }
          HierarchyEngine.validate({ DimId: dim.DimId, Members: probe.Members, Hierarchies: probe.Hierarchies }).forEach((p) => problems.push(p));
          if (problems.length) { MessageBox.error(problems.join("\n")); return; }
          resolve({ Members: members, Hierarchies: hierarchies });
          dlg.close();
          dlg._done = true;
        } }),
        endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
        afterClose: () => { if (!dlg._done) { resolve(null); } dlg.destroy(); }
      });
      render();
      dlg.open();
    });
  }

  return { open };
});
