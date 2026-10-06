/**
 * Search help for text fields whose value comes from a known list: a field that suggests while the user types and has the value help
 * button, which opens a searchable list (one choice, or several for a list field).
 *
 *   ValueHelp.input({ items, value, multi, separator, ...settings of sap.m.Input })  -> sap.m.Input
 *   ValueHelp.insert(input, items)      adds the button to an input or text area whose text is a formula: a choice is inserted at the end
 *   ValueHelp.open({ title, items, multi, selected, onSelect(keys) })
 *   ValueHelp.attachTokens(multiInput, items)   the value help of a sap.m.MultiInput (user names ...)
 *   ValueHelp.lazyUsers(provider | Promise<provider>) -> items   an array that fills itself with the users (use it before the answer is there)
 *   ValueHelp.users(provider) -> Promise<items>   the users the data source knows (owners, people on shares and events)
 *   ValueHelp.CURRENCIES, ValueHelp.UNITS         common currency codes and units of measure
 *
 * items = [{ key, text, description }]: the key is what is written into the field, the text and description are what the list shows.
 * Typing something that is not in the list is still allowed: the list helps, it does not restrict.
 */
sap.ui.define([
  "sap/m/Input", "sap/m/SelectDialog", "sap/m/StandardListItem", "sap/ui/core/ListItem", "sap/m/Token"
], function (Input, SelectDialog, StandardListItem, ListItem, Token) {
  "use strict";

  const pairs = (list) => list.map((p) => ({ key: p[0], text: p[0], description: p[1] }));
  const CURRENCIES = pairs([["USD", "US Dollar"], ["EUR", "Euro"], ["GBP", "British Pound"], ["JPY", "Japanese Yen"], ["CHF", "Swiss Franc"], ["CNY", "Chinese Yuan"],
    ["INR", "Indian Rupee"], ["IDR", "Indonesian Rupiah"], ["SGD", "Singapore Dollar"], ["MYR", "Malaysian Ringgit"], ["THB", "Thai Baht"], ["VND", "Vietnamese Dong"],
    ["PHP", "Philippine Peso"], ["AUD", "Australian Dollar"], ["NZD", "New Zealand Dollar"], ["CAD", "Canadian Dollar"], ["MXN", "Mexican Peso"], ["BRL", "Brazilian Real"],
    ["ZAR", "South African Rand"], ["AED", "UAE Dirham"], ["SAR", "Saudi Riyal"], ["KRW", "South Korean Won"], ["HKD", "Hong Kong Dollar"], ["SEK", "Swedish Krona"],
    ["NOK", "Norwegian Krone"], ["DKK", "Danish Krone"], ["PLN", "Polish Zloty"], ["CZK", "Czech Koruna"], ["TRY", "Turkish Lira"], ["RUB", "Russian Ruble"]]);
  const UNITS = pairs([["PC", "Pieces"], ["EA", "Each"], ["KG", "Kilogram"], ["T", "Tonne"], ["L", "Litre"], ["M", "Metre"], ["KM", "Kilometre"], ["M2", "Square metre"],
    ["M3", "Cubic metre"], ["H", "Hours"], ["D", "Days"], ["FTE", "Full-time equivalents"], ["%", "Percent"]]);

  const lastToken = (text, sep) => String(text).split(sep).pop().trim();
  const hit = (it, q) => !q || (it.key + " " + (it.text || "") + " " + (it.description || "")).toLowerCase().indexOf(q.toLowerCase()) >= 0;

  function open(opts) {
    const items = opts.items || [];
    const chosen = new Set(opts.selected || []);
    const dlg = new SelectDialog({
      title: opts.title || "Select", multiSelect: !!opts.multi, rememberSelections: false, growing: true, growingThreshold: 50,
      search: (e) => fill(e.getParameter("value")),
      liveChange: (e) => fill(e.getParameter("value")),
      confirm: (e) => {
        const keys = opts.multi ? e.getParameter("selectedItems").map((i) => i.data("key")) : [e.getParameter("selectedItem").data("key")];
        if (opts.onSelect) { opts.onSelect(keys); }
      },
      cancel: () => {}, afterClose: () => dlg.destroy()
    });
    function fill(q) {
      dlg.destroyItems();
      items.filter((it) => hit(it, q)).forEach((it) => {
        const li = new StandardListItem({ title: it.text || it.key, description: it.description || "", selected: chosen.has(it.key), icon: it.icon || "" });
        li.data("key", it.key);
        dlg.addItem(li);
      });
    }
    fill("");
    dlg.open();
    return dlg;
  }

  function suggestionsOf(input, items, q) {
    input.destroySuggestionItems();
    items.filter((it) => hit(it, q)).slice(0, 30).forEach((it) => input.addSuggestionItem(new ListItem({ key: it.key, text: it.key, additionalText: it.description || "" })));
  }

  /** An input that suggests the items and has the value help button. multi: the value is a list of keys joined by `separator`. */
  function input(opts) {
    const { items, multi } = opts;
    const sep = opts.separator || ",";
    const settings = Object.assign({}, opts);
    ["items", "multi", "separator"].forEach((k) => delete settings[k]);
    const control = new Input(Object.assign({ width: "100%", showSuggestion: true, filterSuggests: false, showValueHelp: true }, settings));
    control.attachSuggest((e) => suggestionsOf(control, items, lastToken(e.getParameter("suggestValue"), sep)));
    control.attachSuggestionItemSelected((e) => {
      const it = e.getParameter("selectedItem");
      if (!it) { return; }
      if (multi) {
        const parts = control.getValue().split(sep).map((s) => s.trim()); parts.pop();
        control.setValue(parts.concat(it.getKey()).filter(Boolean).join(sep + " "));
      } else { control.setValue(it.getKey()); }
      control.fireChange({ value: control.getValue() });
    });
    control.attachValueHelpRequest(() => open({ title: opts.title || "Select", items, multi: !!multi,
      selected: multi ? control.getValue().split(sep).map((s) => s.trim()).filter(Boolean) : [control.getValue()],
      onSelect: (keys) => { control.setValue(keys.join(multi ? sep + " " : "")); control.fireChange({ value: control.getValue() }); } }));
    return control;
  }

  /** The value help button of a formula field: a choice is added at the end of the formula. */
  function insert(control, items, title) {
    control.setShowValueHelp(true);
    control.attachValueHelpRequest(() => open({ title: title || "Insert", items, multi: false, onSelect: (keys) => {
      const v = control.getValue();
      control.setValue(v + (v && !/[\s(+\-*/]$/.test(v) ? " " : "") + keys[0]);
      control.fireChange({ value: control.getValue() });
      if (control.fireLiveChange) { control.fireLiveChange({ value: control.getValue() }); }
    } }));
    return control;
  }

  /** The value help of a MultiInput: choices become tokens; suggestions as for input(). */
  function attachTokens(mi, items, title) {
    mi.setShowValueHelp(true);
    mi.setShowSuggestion(true);
    mi.setFilterSuggests(false);
    mi.attachSuggest((e) => suggestionsOf(mi, items, e.getParameter("suggestValue")));
    mi.attachSuggestionItemSelected((e) => {
      const it = e.getParameter("selectedItem");
      if (it && !mi.getTokens().some((t) => t.getKey() === it.getKey())) { mi.addToken(new Token({ key: it.getKey(), text: it.getKey() })); mi.fireTokenUpdate({ type: "added", addedTokens: [], removedTokens: [] }); }
      mi.setValue("");
    });
    mi.attachValueHelpRequest(() => open({ title: title || "Select", items, multi: true, selected: mi.getTokens().map((t) => t.getKey()), onSelect: (keys) => {
      mi.removeAllTokens();
      keys.forEach((k) => mi.addToken(new Token({ key: k, text: k })));
      mi.fireTokenUpdate({ type: "added", addedTokens: [], removedTokens: [] });
    } }));
    return mi;
  }

  /** The users a provider knows, as items. */
  async function users(provider) {
    let list = [];
    try { list = await provider.listUsers(); } catch (e) { list = []; }
    return list.map((u) => ({ key: u, text: u, description: "" }));
  }

  /** An array of user items that fills itself once the provider has answered: pass it as `items` before the answer is there. */
  function lazyUsers(provider) {
    const list = [];
    Promise.resolve(provider).then((p) => users(p)).then((u) => { u.forEach((x) => list.push(x)); }).catch(() => {});
    return list;
  }

  return { input, insert, open, attachTokens, users, lazyUsers, CURRENCIES, UNITS };
});
