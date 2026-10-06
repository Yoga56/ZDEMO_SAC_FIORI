/**
 * Makes side panels resizable: a thin handle between a panel and what is next to it, drag it (or use the arrow keys when it has focus), double-click
 * to go back to the standard width. The width is remembered per panel.
 *
 *   Resizer.watch(rules)      rules = [{ selector, handle: "after" | "before" | "inside", key, min, max, def, cssVar }]
 *     selector  the panel; handle: where the handle sits ("after" the panel for a panel on the left, "before" it for one on the right,
 *               "inside" at the right edge of a panel that does not scroll itself)
 *     cssVar    set the width as this custom property on the page root instead of on the panel (for panels whose width a theme control owns)
 *
 * The page is watched, so a panel that is drawn again (the framework replaces its content) gets its width and its handle back.
 */
sap.ui.define(["../core/Resize"], function (Resize) {
  "use strict";

  const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
  let timer = null;

  function apply(el, rule, width) {
    if (rule.cssVar) { document.documentElement.style.setProperty(rule.cssVar, width + "px"); return; }
    if (el.style.width !== width + "px") {
      el.style.width = width + "px"; el.style.flex = "0 0 " + width + "px"; el.style.minWidth = width + "px"; el.style.maxWidth = width + "px";
    }
  }
  function unapply(el, rule) {
    if (rule.cssVar) { document.documentElement.style.removeProperty(rule.cssVar); return; }
    ["width", "flex", "minWidth", "maxWidth"].forEach((p) => { el.style[p] = ""; });
  }

  const current = (el, rule) => (rule.cssVar ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue(rule.cssVar)) || el.getBoundingClientRect().width : el.getBoundingClientRect().width);

  function make(el, rule) {
    const h = document.createElement("div");
    h.className = "zsacSplitter zsacSplitter-" + rule.handle;
    h.setAttribute("role", "separator"); h.setAttribute("aria-orientation", "vertical"); h.setAttribute("tabindex", "0");
    h.setAttribute("title", "Drag to resize, double-click to reset"); h.setAttribute("aria-label", "Resize panel");
    const room = () => (el.parentElement ? el.parentElement.getBoundingClientRect().width : 0);
    const set = (w, keep) => { const c = Resize.clamp(w, rule.min, rule.max, room()); apply(el, rule, c); h.setAttribute("aria-valuenow", String(c)); if (keep) { const s = storage(); if (s) { Resize.write(s, rule.key, c); } } return c; };
    const grows = rule.handle === "before" ? -1 : 1; // dragging to the right makes a panel on the left wider, one on the right narrower
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const x0 = e.clientX; const w0 = current(el, rule);
      try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } document.body.classList.add("zsacResizing"); h.classList.add("zsacSplitterOn");
      const move = (ev) => set(w0 + grows * (ev.clientX - x0), false);
      const up = (ev) => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); document.body.classList.remove("zsacResizing"); h.classList.remove("zsacSplitterOn"); set(w0 + grows * (ev.clientX - x0), true); };
      h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
    h.addEventListener("dblclick", () => { const s = storage(); if (s) { Resize.clear(s, rule.key); } unapply(el, rule); h.setAttribute("aria-valuenow", String(Math.round(current(el, rule)))); });
    h.addEventListener("keydown", (e) => {
      if (e.key === "Home") { h.dispatchEvent(new Event("dblclick")); e.preventDefault(); return; }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") { return; }
      e.preventDefault();
      set(Resize.next(current(el, rule), (e.key === "ArrowRight" ? 1 : -1) * grows, e.shiftKey ? 48 : 16), true);
    });
    return h;
  }

  function scan(rules) {
    rules.forEach((rule) => {
      document.querySelectorAll(rule.selector).forEach((el) => {
        const visible = el.offsetWidth > 0 || el.offsetHeight > 0;
        let h = el.__zsacSplitter;
        if (!h || !h.isConnected) {
          if (!el.parentNode) { return; }
          h = el.__zsacSplitter = make(el, rule);
          if (rule.handle === "inside") { if (getComputedStyle(el).position === "static") { el.style.position = "relative"; } el.appendChild(h); }
          else if (rule.handle === "before") { el.parentNode.insertBefore(h, el); }
          else { el.parentNode.insertBefore(h, el.nextSibling); }
        }
        const s = storage();
        const saved = s ? Resize.read(s, rule.key, 0) : 0;
        if (saved) { apply(el, rule, Resize.clamp(saved, rule.min, rule.max, el.parentElement ? el.parentElement.getBoundingClientRect().width : 0)); }
        h.style.display = visible ? "" : "none";
      });
    });
  }

  function watch(rules) {
    const run = () => { timer = null; scan(rules); };
    const later = () => { if (!timer) { timer = window.requestAnimationFrame(run); } };
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", later);
    window.addEventListener("hashchange", () => { later(); setTimeout(later, 400); setTimeout(later, 1200); }); // a page that is shown by the router changes no attribute of the panel itself
    window.setInterval(later, 1500); // and a safety net for what the observer does not see
    later();
    return { scan: () => scan(rules) };
  }

  return { watch };
});
