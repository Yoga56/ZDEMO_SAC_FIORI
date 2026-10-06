/**
 * What a button or symbol in a story may do (pure). The author of a story writes the settings, so every target is checked here and
 * nothing outside this list can happen.
 *
 *   page     show another page of the story (Props.Page = the page number)
 *   url      open an address in a new tab (http, https)
 *   app      go to a page of this app: "stories/STORY_SALES", "planning", "modeller" (letters, digits, - _ / only)
 *   refresh  read the data of every widget on the page again
 *
 *   ButtonAction.resolve(props, story) -> { ok, kind, error, page, url, hash }
 */
sap.ui.define(["./WebContent"], function (WebContent) {
  "use strict";

  const KINDS = [["none", "Nothing"], ["page", "Go to a page of the story"], ["url", "Open a web address"], ["app", "Go to a page of the app"], ["refresh", "Refresh the page"]];
  const ROUTE = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

  function resolve(props, story) {
    const kind = (props && props.Action) || "none";
    const fail = (error) => ({ ok: false, kind, error });
    switch (kind) {
      case "none": return { ok: true, kind };
      case "refresh": return { ok: true, kind };
      case "page": {
        const n = Number(props.Page);
        const pages = (story && story.Pages) || [];
        if (!pages.some((p) => p.Id === n)) { return fail("The story has no page " + (props.Page === undefined || props.Page === "" ? "(choose one)" : props.Page)); }
        return { ok: true, kind, page: n };
      }
      case "url": {
        const c = WebContent.check(props.Url, "page");
        return c.ok ? { ok: true, kind, url: c.url } : fail(c.error);
      }
      case "app": {
        const r = String(props.Route || "").trim().replace(/^#?\/?/, "");
        return ROUTE.test(r) ? { ok: true, kind, hash: "#/" + r } : fail("Use a page of the app such as stories/STORY_SALES or planning");
      }
      default: return fail("Unknown action " + kind);
    }
  }

  /** The icon names of the SAP icon font look like sap-icon://home; anything else is not accepted as an icon. */
  const isIcon = (s) => /^sap-icon:\/\/[a-z0-9-]+$/.test(String(s || ""));

  return { KINDS, resolve, isIcon };
});
