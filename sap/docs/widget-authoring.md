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

## Visual editor for value driver trees and Compass
The builder panel of the *Value driver tree* and *Compass simulation* widgets builds the tree with lists, not text (`designer/TreeEditor.js`, edits in `core/ValueTreeEdit.js`). A node has a name and an operator (sum, first minus the others, product, first divided by second, or data); a data node has a measure list and "Add filter" lists of members per dimension; under *More* sit the scale, the favourable direction and, for Compass, the range, plus/minus percent and distribution. Moving, adding and removing nodes keeps the tree valid. The tree is still stored as the text of `core/ValueTree` (`Props.Tree`), so existing trees open in the editor and the text can be edited by hand: *Edit as text* switches to it, and a text with problems opens there. A widget field of `kind: "valuetree"` (or `"drivertree"` with uncertainty) gives another widget the same editor. The name of a node is picked from a list of the model's measures and dimension members (a custom name such as "Profit" can still be typed); a data node still called "Driver 2" takes the name of the measure or member you choose for it.

The value driver tree widget shows the tree in a pane the viewer can drag to move it, zoom with the + and - buttons or Ctrl and the wheel, and *Fit* to centre the whole tree. The tree opens fitted and centred, and keeps its place and zoom while a driver is simulated.
