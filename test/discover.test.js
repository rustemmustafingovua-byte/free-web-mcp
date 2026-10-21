import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSitemap, extractJsonLd, sitemap, structured } from "../src/discover.js"

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>https://example.com/docs</loc><lastmod>2026-10-02</lastmod></url>
  <url><loc>https://example.com/blog/post-1</loc></url>
</urlset>`

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`

const HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Lumen","description":"PoS chain",
 "sku":"LMN-1","offers":{"price":"12.50","priceCurrency":"USD"},"aggregateRating":{"ratingValue":"4.8"}}
</script>
<script type="application/ld+json">
[{"@type":"Article","name":"Second","url":"https://example.com/a"}]
</script>
<script type="application/ld+json">{ broken json </script>
</head><body>hi</body></html>`

test("sitemap: urlset разбирается в список URL", () => {
  const r = parseSitemap(SITEMAP)
  assert.equal(r.kind, "urlset")
  assert.equal(r.count, 3)
  assert.equal(r.urls[0], "https://example.com/")
  assert.equal(r.urls[2], "https://example.com/blog/post-1")
  assert.deepEqual(r.lastmod, ["2026-10-01", "2026-10-02"])
})

test("sitemap: index отличается от urlset", () => {
  const r = parseSitemap(SITEMAP_INDEX)
  assert.equal(r.kind, "index")
  assert.equal(r.count, 2)
})

test("sitemap: лимит соблюдается", () => {
  const many = "<urlset>" + "<url><loc>https://e.com/x</loc></url>".repeat(50) + "</urlset>"
  assert.equal(parseSitemap(many, { limit: 10 }).count, 10)
})

test("JSON-LD: товар разбирается (цена, валюта, рейтинг)", () => {
  const r = extractJsonLd(HTML)
  assert.equal(r.count, 2)
  const product = r.items.find((i) => i.type === "Product")
  assert.equal(product.name, "Lumen")
  assert.equal(product.price, "12.50")
  assert.equal(product.currency, "USD")
  assert.equal(product.rating, "4.8")
  assert.equal(product.sku, "LMN-1")
})

test("JSON-LD: битый блок не роняет разбор", () => {
  const r = extractJsonLd('<script type="application/ld+json">{oops</script>')
  assert.equal(r.count, 0)
})

test("sitemap: живой запрос отдаёт список", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async text() { return SITEMAP } })
  const r = await sitemap("https://example.com/sitemap.xml", { fetchImpl: fakeFetch })
  assert.equal(r.count, 3)
})

test("structured: живой запрос отдаёт JSON-LD", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async text() { return HTML } })
  const r = await structured("https://example.com/p", { fetchImpl: fakeFetch })
  assert.equal(r.count, 2)
  assert.equal(r.items[0].type, "Product")
})
