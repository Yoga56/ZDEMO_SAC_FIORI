sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/Text", "sap/m/Title", "sap/m/VBox", "sap/m/HBox", "sap/m/MessageStrip", "sap/m/FlexItemData", "sap/m/CheckBox",
  "zsac/lib/core/Access",
  "zsac/lib/designer/ValueHelp"
], function (Item, Dialog, Button, Input, Select, Text, Title, VBox, HBox, MessageStrip, FlexItemData, CheckBox, Access, ValueHelp) {
  "use strict";

  /**
   * Who may open and who may edit a story or a model: the owner shares it with everyone or with named users.
   *
   * open({ provider, kind: "STORY" | "MODEL" | "DATAACTION" | "MULTIACTION", id }) -> Promise<undefined | shares[]>   undefined: closed without saving
   *
   * Only the owner can change the list. Anyone else sees what applies to them; content without an owner is open to everyone and cannot be shared.
   */
  function open(opts) {
    return new Promise((resolve) => {
      const { provider, kind, id } = opts;
      const noun = { STORY: "story", MODEL: "model", DATAACTION: "data action", MULTIACTION: "multi action" }[kind] || "object";
      const body = new VBox({ width: "30rem" }).addStyleClass("sapUiSmallMargin");
      const status = new VBox();
      const users = ValueHelp.lazyUsers(provider);
      const note = (text, type) => { status.destroyItems(); if (text) { status.addItem(new MessageStrip({ text, type: type || "Error", showIcon: true }).addStyleClass("sapUiTinyMarginTop")); } };
      let everyone = ""; let people = []; let canEdit = false; let object = null; let me = "";
      let datasets = []; let alsoDatasets = true;   // a story shows nothing to someone who cannot open the datasets it reads: the ones the owner owns can be shared along

      const accessSelect = (value, onChange, withNone) => {
        const sel = new Select({ selectedKey: value, width: "9rem", enabled: canEdit, change: (e) => onChange(e.getParameter("selectedItem").getKey()) });
        if (withNone) { sel.addItem(new Item({ key: "", text: "No access" })); }
        sel.addItem(new Item({ key: "READ", text: "Can view" }));
        sel.addItem(new Item({ key: "WRITE", text: "Can edit" }));
        return sel;
      };

      function render() {
        body.destroyItems();
        if (!object) { return; }
        const open_ = Access.isOpen(object.Owner);
        if (open_) {
          body.addItem(new MessageStrip({ text: "This " + noun + " has no owner, so everyone can open and edit it. Only content that someone owns can be shared.", type: "Information", showIcon: true }));
          return;
        }
        body.addItem(new Text({ text: "Owner: " + object.Owner + (canEdit ? " (you)" : "") }).addStyleClass("sapUiTinyMarginBottom"));
        if (!canEdit) { body.addItem(new MessageStrip({ text: "Only the owner can change who has access. " + (object.Access === "WRITE" ? "You can view and edit this " + noun + "." : "You can view this " + noun + "."), type: "Information", showIcon: true }).addStyleClass("sapUiTinyMarginBottom")); }
        body.addItem(new Title({ text: "Everyone", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        body.addItem(new HBox({ alignItems: "Center", items: [new Text({ text: "Every user of this system", layoutData: new FlexItemData({ growFactor: 1 }) }), accessSelect(everyone, (v) => { everyone = v; }, true)] }));
        body.addItem(new Title({ text: "People", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        if (!people.length) { body.addItem(new Text({ text: canEdit ? "Nobody yet. Add a user name below." : "No named users." }).addStyleClass("zsacSmall")); }
        people.forEach((p, i) => body.addItem(new HBox({ alignItems: "Center", items: [
          new Text({ text: p.Principal, layoutData: new FlexItemData({ growFactor: 1 }) }),
          accessSelect(p.Access, (v) => { p.Access = v; }, false),
          new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Remove", visible: canEdit, press: () => { people.splice(i, 1); render(); } })] })));
        if (canEdit && datasets.length) {
          body.addItem(new CheckBox({ text: "Also share the dataset" + (datasets.length > 1 ? "s" : "") + " this story reads (" + datasets.join(", ") + ") with them, view only", selected: alsoDatasets,
            select: (e) => { alsoDatasets = e.getParameter("selected"); } }).addStyleClass("sapUiSmallMarginTop"));
        }
        if (canEdit) {
          const name = ValueHelp.input({ items: users, title: "Users", placeholder: "User name, e.g. BOB", maxLength: 12, layoutData: new FlexItemData({ growFactor: 1 }),
            submit: () => add() });
          const add = () => {
            const n = Access.normalize([{ Principal: name.getValue(), Access: "READ" }], object.Owner);
            if (n.errors.length) { note(n.errors.join(" ")); return; }
            if (!n.shares.length) { note(name.getValue().trim() ? "The owner always has full access." : "", "Information"); return; }
            if (!people.some((p) => p.Principal === n.shares[0].Principal)) { people.push(n.shares[0]); }
            note(""); render();
          };
          body.addItem(new HBox({ class: "sapUiTinyMarginTop", items: [name, new Button({ text: "Add", press: add })] }).addStyleClass("sapUiSmallMarginTop"));
        }
      }

      const save = new Button({ text: "Save", type: "Emphasized", enabled: false, press: async () => {
        const shares = (everyone ? [{ Principal: Access.EVERYONE, Access: everyone }] : []).concat(people);
        try {
          const saved = await provider.saveShares(kind, id, shares);
          if (alsoDatasets) { for (const mid of datasets) { await shareDataset(mid, shares); } }
          dlg.close(); resolve(saved);
        } catch (e) { note((e && e.message) || String(e)); }
      } });
      /** Gives the people of the story at least view access to a dataset: what they have already is kept when it is more. */
      async function shareDataset(mid, shares) {
        const have = await provider.listShares("MODEL", mid);
        const merged = have.map((x) => ({ Principal: x.Principal, Access: x.Access }));
        shares.forEach((n) => {
          const at = merged.find((x) => x.Principal === n.Principal);
          if (!at) { merged.push({ Principal: n.Principal, Access: "READ" }); } else if (at.Access !== "WRITE") { at.Access = "READ"; }
        });
        await provider.saveShares("MODEL", mid, merged);
      }

      const dlg = new Dialog({ title: "Share " + noun, contentWidth: "32rem", content: [new VBox({ items: [body, status] })],
        beginButton: save, endButton: new Button({ text: "Close", press: () => { dlg.close(); resolve(undefined); } }), afterClose: () => dlg.destroy() });
      dlg.open();
      dlg.setBusy(true);
      (async () => {
        try {
          me = await provider.currentUser();
          object = await provider.getShareable(kind, id);
          canEdit = !Access.isOpen(object.Owner) && object.Access === "OWNER";
          const shares = await provider.listShares(kind, id);
          everyone = (shares.find((s) => s.Principal === Access.EVERYONE) || {}).Access || "";
          people = shares.filter((s) => s.Principal !== Access.EVERYONE).map((s) => ({ Principal: s.Principal, Access: s.Access }));
          if (kind === "STORY" && canEdit) {   // the datasets of the story that this user owns
            const story = await provider.getStory(id).catch(() => null);
            const ids = Array.from(new Set(((story && story.Widgets) || []).map((w) => w.Binding && w.Binding.ModelId).concat(story ? [story.ModelId] : []).filter(Boolean)));
            for (const mid of ids) { const m = await provider.getShareable("MODEL", mid).catch(() => null); if (m && m.Access === "OWNER" && !Access.isOpen(m.Owner)) { datasets.push(mid); } }
          }
          save.setEnabled(canEdit);
          render();
        } catch (e) { note((e && e.message) || String(e)); } finally { dlg.setBusy(false); }
      })();
    });
  }

  return { open };
});
