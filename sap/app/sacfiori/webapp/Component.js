sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/Device",
  "zsac/lib/library",
  "zsac/lib/widget/Widgets",
  "zsac/lib/core/ProviderRegistry",
  "zsac/lib/designer/Resizer"
], function (UIComponent, Device, lib, Widgets, ProviderRegistry, Resizer) {
  "use strict";

  /** The side panels that can be resized: where they are, where the handle sits, the limits and the standard width (pixels). */
  const PANELS = [
    { selector: ".zsacPalette[id*='---story--']", handle: "after", key: "palette", min: 140, max: 480, def: 208 },
    { selector: ".zsacPalette[id*='---analyser--']", handle: "after", key: "analyserLeft", min: 220, max: 640, def: 352 },
    { selector: ".zsacDesigner > .zsacRight:not(.zsacRightWide)", handle: "before", key: "builder", min: 240, max: 760, def: 352 },
    { selector: ".zsacModeller .zsacRightWide", handle: "before", key: "modellerSide", min: 260, max: 760, def: 416 },
    { selector: ".zsacDesignerFlow", handle: "after", key: "flow", min: 160, max: 480, def: 256 },
    { selector: ".zsacCalPanel", handle: "before", key: "calendarPanel", min: 300, max: 760, def: 416 },
    { selector: ".zsacCalLeft", handle: "inside", key: "calendarList", min: 320, max: 1100, def: 704, cssVar: "--zsacCalLeftW" }
  ];

  /**
   * Chooses the data provider: ?provider=mock or ?provider=odata in the URL; else odata when the app runs from the ABAP system or a launchpad; else sap.ui5/config/provider of the manifest (mock).
   * `component.providerReady` resolves to the provider; the router starts when it is ready.
   */
  return UIComponent.extend("zsac.fiori.Component", {
    metadata: { manifest: "json" },

    init() {
      UIComponent.prototype.init.apply(this, arguments);
      Resizer.watch(PANELS);
      this.providerReady = this._createProvider();
      this.providerReady.then(() => this.getRouter().initialize());
    },

    async _createProvider() {
      const fromUrl = new URLSearchParams(window.location.search).get("provider");
      // the app deployed to the ABAP system (or opened from a launchpad) works on the backend; the mock data is for development
      const deployed = /\/sap\/bc\/ui5_ui5\//.test(window.location.pathname) || !!(window.sap && sap.ushell && sap.ushell.Container);
      const name = fromUrl || (deployed ? "odata" : this.getManifestEntry("/sap.ui5/config/provider")) || "mock";
      // ?user=ALICE plays another user of the sample data: sharing and ownership can be tried without a backend
      if (name !== "odata") { return ProviderRegistry.get({ name, user: new URLSearchParams(window.location.search).get("user") || undefined }); }
      const ODataModel = await new Promise((resolve) => sap.ui.require(["sap/ui/model/odata/v4/ODataModel"], resolve));
      const model = new ODataModel({
        serviceUrl: this.getManifestEntry("/sap.app/dataSources/mainService/uri"),
        operationMode: "Server", autoExpandSelect: false, earlyRequests: true, groupId: "$auto"
      });
      this.setModel(model);
      return ProviderRegistry.get({ name, model });
    },

    getProvider() { return this.providerReady; },

    getContentDensityClass() {
      return Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
    }
  });
});
