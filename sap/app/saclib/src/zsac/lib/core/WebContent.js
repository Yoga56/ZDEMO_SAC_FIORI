/**
 * Checks of the addresses a story may show (pure): an image widget loads a picture, a web page widget embeds a page.
 * A story is data anyone with edit rights writes, so only plain http(s) addresses, paths on this server and (for pictures) small
 * embedded images are accepted; javascript:, file: and other schemes never reach the page.
 *
 *   WebContent.check(url, "image" | "page") -> { ok, url, error }
 *   WebContent.sandbox(url, origin) -> value of the iframe sandbox attribute
 */
sap.ui.define([], function () {
  "use strict";

  const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;

  function check(url, kind) {
    const u = String(url || "").trim();
    if (!u) { return { ok: false, url: "", error: "Enter an address" }; }
    if (kind === "image" && IMAGE_DATA.test(u)) { return { ok: true, url: u, error: "" }; }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    if (scheme) {
      if (!/^https?$/i.test(scheme[1])) { return { ok: false, url: "", error: "Only http and https addresses can be shown" }; }
      return /^https?:\/\/[^\s/]+/i.test(u) ? { ok: true, url: u, error: "" } : { ok: false, url: "", error: "The address has no host" };
    }
    if (u.indexOf("//") === 0) { return { ok: true, url: "https:" + u, error: "" }; }
    return /[\s<>"]/.test(u) ? { ok: false, url: "", error: "The address contains characters that are not allowed" } : { ok: true, url: u, error: "" };
  }

  /** A page from another origin may run scripts in its own frame, but never as part of this app: same-origin pages get no script access to the parent. */
  function sandbox(url, origin) {
    let own = !/^[a-z][a-z0-9+.-]*:/i.test(String(url)) && String(url).indexOf("//") !== 0;
    if (!own) { try { own = new URL(url, origin).origin === origin; } catch (e) { own = true; } }
    return own ? "allow-forms allow-popups" : "allow-forms allow-popups allow-scripts allow-same-origin";
  }

  return { check, sandbox };
});
