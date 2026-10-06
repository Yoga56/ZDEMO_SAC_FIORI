const test = require("node:test");
const assert = require("node:assert");
const req = require("./loader");
const WebContent = req("zsac/lib/core/WebContent");

test("web content: http(s), paths and small pictures pass; script and file schemes never do", () => {
  assert.strictEqual(WebContent.check("https://example.com/a.png", "image").ok, true);
  assert.strictEqual(WebContent.check("  /img/logo.png ", "image").url, "/img/logo.png");
  assert.strictEqual(WebContent.check("//cdn.example.com/x.png", "image").url, "https://cdn.example.com/x.png");
  assert.strictEqual(WebContent.check("data:image/png;base64,iVBORw0KGgo=", "image").ok, true);
  ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "file:///etc/passwd", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:x", "ftp://host/x"].forEach((u) => {
    assert.strictEqual(WebContent.check(u, "image").ok, false, u);
    assert.strictEqual(WebContent.check(u, "page").ok, false, u);
  });
  // an embedded picture is not an address for a page
  assert.strictEqual(WebContent.check("data:image/png;base64,iVBORw0KGgo=", "page").ok, false);
  assert.strictEqual(WebContent.check("", "page").ok, false);
  assert.strictEqual(WebContent.check("https://", "page").ok, false);
  assert.strictEqual(WebContent.check("a b.png", "image").ok, false);
});

test("web content: a page of this server gets no scripts, another origin keeps its own", () => {
  assert.strictEqual(WebContent.sandbox("/local/page.html", "https://app.example.com"), "allow-forms allow-popups");
  assert.strictEqual(WebContent.sandbox("https://app.example.com/x", "https://app.example.com"), "allow-forms allow-popups");
  assert.match(WebContent.sandbox("https://other.example.org/x", "https://app.example.com"), /allow-scripts allow-same-origin/);
});
