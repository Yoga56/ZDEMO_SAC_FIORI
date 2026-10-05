# Writing a widget

A widget is one registration. The palette, the viewer, the builder panel and the analyser read only the registry.

```js
sap.ui.define([
  "zsac/lib/core/WidgetRegistry", "zsac/lib/widget/Widgets", "zsac/lib/widget/WidgetCard", "sap/m/Text"
], function (WidgetRegistry, Widgets, WidgetCard, Text) {
  WidgetRegistry.register("stat.total", {
    name: "Total", icon: "sap-icon://sum", group: "Indicators",
    size: { w: 3, h: 2 },                                  // grid cells
    defaults: { Binding: { ModelId: "", Rows: [], Columns: [], Measure: "", Filters: {} }, Props: { Prefix: "Total" } },
    builder: [                                             // the builder panel is generated from this list
      { key: "Title", label: "Title", kind: "text" },
      { key: "Binding.ModelId", label: "Model", kind: "model" },
      { key: "Binding.Measure", label: "Measure", kind: "measure" },
      { key: "Binding.Filters", label: "Filters", kind: "filters" },
      { key: "Props.Prefix", label: "Prefix", kind: "text" }
    ],
    create(widget, ctx) {                                  // ctx = { provider, bus, filters }
      const text = new Text();
      const card = new WidgetCard({ title: widget.Title, widgetId: widget.Id, content: text });
      card.refresh = async () => {                         // called on load and whenever a story filter changes
        const result = await Widgets.runQuery(widget, ctx);   // story filters narrow the widget's own filters
        text.setText(widget.Props.Prefix + ": " + result.grand);
      };
      return card;
    }
  });
});
```

Builder field kinds: `text`, `textarea`, `number`, `bool`, `select` (`options: [[key, text]]`), `model`, `dimension`,
`dimensions` (`max`), `measure`, `version`, `filters` (includes search and replace of filter values).
Use `"$FIRST_DIM"` / `"$SECOND_DIM"` in `defaults` to be replaced by the model's dimensions when the widget is dropped.
Load the module once (for example from `Component.js`) and the widget is available everywhere.
