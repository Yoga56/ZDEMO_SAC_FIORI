sap.ui.define([
  "sap/ui/core/Item",
  "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/ComboBox", "sap/m/Label", "sap/m/Text", "sap/m/Title", "sap/m/VBox", "sap/m/HBox", "sap/m/CheckBox",
  "sap/m/MessageStrip", "sap/m/MessageBox", "sap/m/MessageToast", "sap/m/FlexItemData",
  "zsac/lib/provider/LiveSource"
], function (Item, Dialog, Button, Input, Select, ComboBox, Label, Text, Title, VBox, HBox, CheckBox, MessageStrip, MessageBox, MessageToast, FlexItemData, LiveSource) {
  "use strict";

  /**
   * Connects a model to a CDS view (any OData V4 entity set): live or import, the service and entity, which field is the period,
   * which field is which dimension and measure.
   *
   * open({ provider, model, source }) -> Promise<undefined | { Source: object|null, Found: {Members, PeriodFrom, PeriodTo}|null }>
   *   model   the model as the Modeller holds it (its dimensions and measures are what gets mapped)
   *   source  the current source or null
   *   undefined: cancelled; Source null: the source was removed; Found: members and period range read from the source (when asked for)
   */
  function open(opts) {
    return new Promise((resolve) => {
      const { provider, model } = opts;
      const src = LiveSource.defaults(opts.source || { Mode: "LIVE" });
      src.Dims = Object.assign({}, src.Dims);
      src.Texts = Object.assign({}, src.Texts);
      src.Measures = Object.assign({}, src.Measures);
      let fields = [];
      const hadSource = !!opts.source;

      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
      const guess = () => {
        const find = (...names) => { const keys = names.map(norm); const f = fields.find((x) => keys.indexOf(norm(x.name)) >= 0); return f ? f.name : ""; };
        if (!src.PeriodField) { src.PeriodField = find("FiscalPeriod", "Period", "PostingDate", "CalendarMonth", "YearMonth", "Month"); }
        (model.Dimensions || []).forEach((d) => { if (!src.Dims[d.DimId]) { src.Dims[d.DimId] = find(d.DimId, d.Label); } });
        (model.Measures || []).forEach((m) => { if (!src.Measures[m.MeasureId]) { src.Measures[m.MeasureId] = find(m.MeasureId, m.Label); } });
      };

      const status = new VBox();
      const body = new VBox({ width: "34rem" }).addStyleClass("sapUiSmallMargin");
      const note = (text, type) => { status.destroyItems(); status.addItem(new MessageStrip({ text, type: type || "Information", showIcon: true }).addStyleClass("sapUiTinyMarginTop")); };
      const fail = (e) => note((e && e.message) || String(e), "Error");

      const fieldBox = (get, set, placeholder) => {
        const c = new ComboBox({ width: "100%", value: get() || "", placeholder: placeholder || "Field", change: (e) => set(e.getParameter("value").trim()) });
        fields.forEach((f) => c.addItem(new Item({ key: f.name, text: f.name + (f.type ? "  (" + f.type.replace("Edm.", "") + ")" : "") })));
        c.attachSelectionChange((e) => { const it = e.getParameter("selectedItem"); if (it) { set(it.getKey()); } });
        return c;
      };

      function render() {
        body.destroyItems();
        const mode = new Select({ width: "100%", selectedKey: src.Mode, change: (e) => { src.Mode = e.getParameter("selectedItem").getKey(); render(); },
          items: [new Item({ key: "LIVE", text: "Live: read the view when a story or table asks (read only)" }), new Item({ key: "IMPORT", text: "Import: copy rows into versions of this planning model" })] });
        const row = (label, control, hint) => { body.addItem(new Label({ text: label }).addStyleClass("sapUiTinyMarginTop")); body.addItem(control); if (hint) { body.addItem(new Text({ text: hint }).addStyleClass("zsacSmall")); } };
        row("How the data is used", mode, src.Mode === "LIVE"
          ? "Every query goes to the service, aggregated there, with the access control of your own user. The model has one version and cannot be planned."
          : "The model keeps its own versions and plan data; an Import from Source step (or the import button) copies the rows into a version.");
        const service = new Input({ value: src.Service, width: "100%", placeholder: "/sap/opu/odata4/sap/zui_sales/srvd_a2x/sap/zsales/0001/", layoutData: new FlexItemData({ growFactor: 1 }), change: (e) => { src.Service = e.getParameter("value").trim(); } });
        row("Service URL", new HBox({ width: "100%", items: [service, new Button({ text: "Read fields", icon: "sap-icon://refresh", press: () => load(service) })] }),
          "Starts with / for a service on this server, or https:// . Use the path without host: the proxy or the destination adds host and login. The $metadata of the service lists its entities and fields.");
        row("Client (optional)", new Input({ value: src.Client, width: "8rem", maxLength: 3, placeholder: "100", change: (e) => { src.Client = e.getParameter("value").trim(); } }),
          "Only when the data is in another client than the one of the destination, for example 100. Sent as sap-client with every request.");
        const entity = new ComboBox({ width: "100%", value: src.Entity, placeholder: "Entity set", change: (e) => { src.Entity = e.getParameter("value").trim(); pick(); } });
        entitySets.forEach((s) => entity.addItem(new Item({ key: s.name, text: s.name })));
        entity.attachSelectionChange((e) => { const it = e.getParameter("selectedItem"); if (it) { src.Entity = it.getKey(); pick(); } });
        row("Entity set (the CDS view)", entity);
        if (src.Mode === "LIVE") {
          row("Version of the rows", new Input({ value: src.Version, width: "10rem", change: (e) => { src.Version = e.getParameter("value").trim().toUpperCase(); } }), "The one version this model has, for example ACT.");
        }
        body.addItem(new Title({ text: "Period", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        const fmt = new Select({ width: "14rem", selectedKey: src.PeriodFormat, change: (e) => { src.PeriodFormat = e.getParameter("selectedItem").getKey(); },
          items: [new Item({ key: "YYYYMM", text: "202603" }), new Item({ key: "YYYY-MM", text: "2026-03" }), new Item({ key: "DATE", text: "2026-03-15 (a date)" })] });
        body.addItem(new HBox({ width: "100%", items: [fieldBox(() => src.PeriodField, (v) => { src.PeriodField = v; }, "Period field"), fmt] }));
        body.addItem(new Text({ text: "A date field is summed up by month here; it cannot give an average by month." }).addStyleClass("zsacSmall"));
        body.addItem(new Title({ text: "Dimensions", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        (model.Dimensions || []).forEach((d) => body.addItem(new HBox({ alignItems: "Center", width: "100%", items: [
          new Text({ text: d.Label || d.DimId, width: "8rem" }), fieldBox(() => src.Dims[d.DimId], (v) => { src.Dims[d.DimId] = v; }),
          fieldBox(() => src.Texts[d.DimId], (v) => { if (v) { src.Texts[d.DimId] = v; } else { delete src.Texts[d.DimId]; } }, "Text field (optional)")] })));
        body.addItem(new Title({ text: "Measures", level: "H5" }).addStyleClass("sapUiSmallMarginTop"));
        (model.Measures || []).forEach((m) => body.addItem(new HBox({ alignItems: "Center", width: "100%", items: [
          new Text({ text: m.Label || m.MeasureId, width: "8rem" }), fieldBox(() => src.Measures[m.MeasureId], (v) => { src.Measures[m.MeasureId] = v; })] })));
        body.addItem(new CheckBox({ text: "Also read the members of the dimensions and the period range from the source", selected: loadAlso, select: (e) => { loadAlso = e.getParameter("selected"); } }).addStyleClass("sapUiSmallMarginTop"));
      }

      let entitySets = [];
      let loadAlso = !(model.Dimensions || []).some((d) => (d.Members || []).length);

      function pick() {
        const set = entitySets.find((s) => s.name === src.Entity);
        fields = set ? set.properties : fields;
        guess();
        render();
      }

      async function load(input) {
        try {
          src.Service = input.getValue().trim();
          entitySets = await provider.discoverSource(src.Service, src.Client);
          if (!entitySets.length) { note("The service has no entity sets.", "Warning"); } else { note(entitySets.length + " entity sets found. Choose one.", "Success"); }
          if (entitySets.length === 1 && !src.Entity) { src.Entity = entitySets[0].name; }
          pick();
        } catch (e) { fail(e); }
      }

      const current = () => Object.assign({}, src, { Dims: Object.assign({}, src.Dims), Texts: Object.assign({}, src.Texts), Measures: Object.assign({}, src.Measures) });
      const problems = () => LiveSource.validate(Object.assign({}, model, { Source: current() }));

      const test = new Button({ text: "Test", icon: "sap-icon://inspection", press: async () => {
        const p = problems();
        if (p.length) { note(p.join("\n"), "Error"); return; }
        try {
          const r = await provider.testSource(Object.assign({}, model, { Source: current(), PeriodFrom: model.PeriodFrom || "0000-01", PeriodTo: model.PeriodTo || "9999-12" }));
          note(r.Count + " values read" + (r.Count ? ", for example " + r.Sample.slice(0, 2).map((f) => f.Measure + " " + f.Period + " " + [f.Dim1, f.Dim2, f.Dim3].filter(Boolean).join("/") + " = " + f.Value).join("; ") : ". Check the period format and the model periods."),
            r.Count ? "Success" : "Warning");
        } catch (e) { fail(e); }
      } });

      const dlg = new Dialog({ title: "Data source", contentWidth: "36rem", content: [new VBox({ items: [body, status] })],
        buttons: [
          test,
          new Button({ text: "Remove source", visible: hadSource, press: () => { dlg.close(); resolve({ Source: null, Found: null }); } }),
          new Button({ text: "OK", type: "Emphasized", press: async () => {
            const p = problems();
            if (p.length) { note(p.join("\n"), "Error"); return; }
            let found = null;
            if (loadAlso) {
              try { found = await provider.loadSourceMembers(Object.assign({}, model, { Source: current() })); } catch (e) { fail(e); return; }
            }
            dlg.close();
            resolve({ Source: current(), Found: found });
          } }),
          new Button({ text: "Cancel", press: () => { dlg.close(); resolve(undefined); } })],
        afterClose: () => dlg.destroy() });
      render();
      dlg.open();
      if (src.Service) { // fields of the current definition, so the pickers are filled
        provider.discoverSource(src.Service, src.Client).then((sets) => { entitySets = sets; const set = sets.find((s) => s.name === src.Entity); if (set) { fields = set.properties; } render(); }).catch(() => {});
      }
    });
  }

  return { open };
});
