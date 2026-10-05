# Writing a data provider

Extend `zsac.lib.core.DataProvider` and implement the primitives; `query`, `saveStory`, `saveModel`, `saveDataAction` and
`saveMultiAction` are composed in the base class (the save methods also keep the Files catalogue in step).

Minimum for read only analysis: `listModels`, `getModel`, `readFacts(modelId, filters)`. Everything else rejects with
"does not implement" and the pages that need it show the message.

```js
class S4Provider extends DataProvider {
  get id() { return "s4"; }
  async listModels() { /* one model per analytical query: dimensions with slots, measures */ }
  async getModel(id) { /* ... */ }
  async readFacts(modelId, filters) { /* rows { ModelId, VersionId, Period, Measure, Dim1..Dim5, Value } */ }
}
ProviderRegistry.register("s4", async (options) => new S4Provider(options));   // then ?provider=s4
```

`filters` is `{ DIM_ID: [members] }` with the built-ins `VERSION`, `PERIOD`, `MEASURE`; a provider may push the filter down or
return a superset, the engine filters again. Facts of a read only source have no versions: map them to one public version.
