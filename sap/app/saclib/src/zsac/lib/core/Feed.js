/**
 * RSS 2.0 and Atom feeds to a list of items (pure, no DOM, so it runs anywhere). Only text comes out: tags and scripts in a feed
 * are removed, entities decoded, and a link is kept only if it is an http(s) address.
 *
 *   Feed.parse(text, max) -> { title, items: [{ title, link, date, summary }], error }
 *   Feed.SAMPLE -> a small feed used by the address mock://news
 */
sap.ui.define(["./WebContent"], function (WebContent) {
  "use strict";

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e.charAt(0) === "#") { const n = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
  /** CDATA is taken as it is, anything else has its entities decoded; then tags go and spaces are tidied. */
  function text(raw) {
    if (raw === null || raw === undefined) { return ""; }
    let s = String(raw);
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
    s = cdata ? cdata[1] : decode(s);
    // a description is often escaped HTML: decode once more when it still holds entities for tags
    // block tags are a break between words, inline tags (b, a, span) are not
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|table|blockquote|pre|hr|img)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "");
    return decode(s).replace(/\s+/g, " ").trim();
  }

  function tag(block, name) {
    const m = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(block);
    return m ? m[1] : null;
  }

  function link(block) {
    const href = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i.exec(block); // Atom
    const raw = href ? decode(href[1]) : text(tag(block, "link"));
    const c = WebContent.check(raw, "page");
    return c.ok && /^https?:/i.test(c.url) ? c.url : "";
  }

  function date(raw) {
    const t = Date.parse(text(raw));
    return isNaN(t) ? "" : new Date(t).toISOString();
  }

  function parse(xml, max) {
    const src = String(xml || "");
    if (!/<(rss|feed|rdf:RDF)\b/i.test(src)) { return { title: "", items: [], error: "This is not an RSS or Atom feed" }; }
    const kind = /<feed\b/i.test(src) ? "entry" : "item";
    const blocks = src.match(new RegExp("<" + kind + "\\b[\\s\\S]*?</" + kind + ">", "gi")) || [];
    const head = src.replace(new RegExp("<" + kind + "\\b[\\s\\S]*$", "i"), "");
    const items = blocks.slice(0, Math.max(1, max || 10)).map((b) => ({
      title: text(tag(b, "title")) || "(no title)", link: link(b),
      date: date(tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date")),
      summary: text(tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 280)
    }));
    return { title: text(tag(head, "title")), items, error: "" };
  }

  const SAMPLE = '<?xml version="1.0"?><rss version="2.0"><channel><title>Company news</title>'
    + "<item><title>Q3 close is on schedule</title><link>https://example.com/news/q3-close</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate><description>The finance team reports that all entities will close on day five.</description></item>"
    + "<item><title>New pricing for Cloud ERP</title><link>https://example.com/news/pricing</link><pubDate>Fri, 02 Oct 2026 14:30:00 GMT</pubDate><description><![CDATA[<p>The price list changes from <b>1 January</b>. See the planning guide.</p>]]></description></item>"
    + "<item><title>Planning calendar for 2027</title><link>https://example.com/news/calendar</link><pubDate>Wed, 30 Sep 2026 09:15:00 GMT</pubDate><description>Budget input opens in November.</description></item></channel></rss>";

  return { parse, text, SAMPLE };
});
