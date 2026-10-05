/**
 * Chooses the data provider for an app. An app calls ProviderRegistry.get({ name, model }) once (Component.js);
 * `name` comes from the URL (?provider=odata) or the manifest, the default is "mock".
 *
 * Third parties add a source with ProviderRegistry.register("s4", async (options) => new S4Provider(options)).
 */
sap.ui.define([
  "../provider/MockProvider",
  "../provider/ODataV4Provider"
], function (MockProvider, ODataV4Provider) {
  "use strict";

  const factories = new Map();
  factories.set("mock", (options) => MockProvider.create(options));
  factories.set("odata", (options) => Promise.resolve(new ODataV4Provider(options)));

  return {
    register(name, factory) { factories.set(name, factory); },
    names() { return Array.from(factories.keys()); },
    async get(options) {
      const name = (options && options.name) || "mock";
      const factory = factories.get(name);
      if (!factory) { throw new Error("No data provider registered as '" + name + "'"); }
      return factory(options || {});
    }
  };
});
