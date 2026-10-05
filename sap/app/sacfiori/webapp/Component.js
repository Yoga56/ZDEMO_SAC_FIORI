sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/Device",
  "zsac/lib/library",
  "zsac/lib/widget/Widgets",
  "zsac/lib/core/ProviderRegistry"
], function (UIComponent, Device, lib, Widgets, ProviderRegistry) {
  "use strict";

  /**
   * Chooses the data provider: ?provider=odata in the URL, else sap.ui5/config/provider of the manifest (mock).
   * `component.providerReady` resolves to the provider; the router starts when it is ready.
   */
  return UIComponent.extend("zsac.fiori.Component", {
    metadata: { manifest: "json" },

    init() {
      UIComponent.prototype.init.apply(this, arguments);
      this.providerReady = this._createProvider();
      this.providerReady.then(() => this.getRouter().initialize());
    },

    async _createProvider() {
      const fromUrl = new URLSearchParams(window.location.search).get("provider");
      const name = fromUrl || this.getManifestEntry("/sap.ui5/config/provider") || "mock";
      if (name !== "odata") { return ProviderRegistry.get({ name }); }
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
