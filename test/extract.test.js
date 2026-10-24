import { test } from "node:test"
import assert from "node:assert/strict"
import { extractFromHtml, parseFeed, toAbsolute, decodeEntities } from "../src/extract.js"

const HTML = `<!doctype html>
<html><head>
  <title>  Lumen — цепь со своим рынком  </title>
  <meta name="description" content="PoS-цепь, где ликвидность &amp; обмен живут в протоколе">
  <meta property="og:image" content="https://example.com/preview.png">
  <meta property="og:site_name" content="Example">
  <link rel="canonical" href="https://example.com/lumen">
</head><body>
  <h1>Lumen</h1>
  <a href="/docs">Документация</a>
  <a href="https://github.com/x/y">Репозиторий</a>
  <a href="/docs">Документация</a>
  <a href="#anchor">Якорь</a>
  <a href="/empty"></a>
</body></html>`

test("extract: заголовок, описание и og-метаданные", () => {
  const d = extractFromHtml(HTML)
  assert.equal(d.title, "Lumen — цепь со своим рынком")
  assert.equal(d.description, "PoS-цепь, где ликвидность & обмен живут в протоколе")
  assert.equal(d.ogImage, "https://example.com/preview.png")
  assert.equal(d.siteName, "Example")
  assert.equal(d.canonical, "https://example.com/lumen")
})

test("extract: ссылки без дублей, с текстом", () => {
  const d = extractFromHtml(HTML)
  const urls = d.links.map((l) => l.url)
  assert.deepEqual(urls, ["/docs", "https://github.com/x/y"])
  assert.equal(d.links[0].text, "Документация")
  assert.equal(d.linksFound, 2)
})

test("extract: относительные ссылки делаются абсолютными", () => {
  const d = extractFromHtml(HTML)
  const abs = d.links.map((l) => toAbsolute(l.url, "https://example.com/lumen"))
  assert.equal(abs[0], "https://example.com/docs")
})

test("decodeEntities: обычные и числовые сущности", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt;"), "a & b <c>")
  assert.equal(decodeEntities("&#8212; &#x2014;"), "— —")
  assert.equal(decodeEntities("&nbsp;x"), " x")
})

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Мой блог</title>
  <item>
    <title>Первый пост</title>
    <link>https://example.com/1</link>
    <pubDate>Mon, 20 Oct 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[Короткое описание &amp; мысль]]></description>
  </item>
  <item>
    <title>Второй пост</title>
    <link>https://example.com/2</link>
    <pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`

test("feed: RSS разбирается в список", () => {
  const f = parseFeed(RSS)
  assert.equal(f.title, "Мой блог")
  assert.equal(f.count, 2)
  assert.equal(f.items[0].title, "Первый пост")
  assert.equal(f.items[0].link, "https://example.com/1")
  assert.equal(f.items[0].summary, "Короткое описание & мысль")
})

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom-лента</title>
  <entry>
    <title>Запись</title>
    <link href="https://example.com/atom/1"/>
    <updated>2026-10-21T12:00:00Z</updated>
    <summary>Текст записи</summary>
  </entry>
</feed>`

test("feed: Atom тоже разбирается", () => {
  const f = parseFeed(ATOM)
  assert.equal(f.title, "Atom-лента")
  assert.equal(f.count, 1)
  assert.equal(f.items[0].link, "https://example.com/atom/1")
  assert.equal(f.items[0].published, "2026-10-21T12:00:00Z")
})

test("feed: лимит items соблюдается", () => {
  const many = RSS.replace("</channel>", Array.from({ length: 10 }, (_, i) => `<item><title>П${i}</title><link>https://e.com/${i}</link></item>`).join("") + "</channel>")
  assert.equal(parseFeed(many, { limit: 3 }).count, 3)
})
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

test("self-hosting guide documents tunnel, systemd unit, reverse proxy, x402 pricing, and docker run", () => {
  const docPath = join(ROOT, "docs", "SELF-HOSTING.md")
  assert.equal(existsSync(docPath), true)
  const doc = readFileSync(docPath, "utf8")
  assert.match(doc, /cloudflared tunnel|ngrok/i)
  assert.match(doc, /\[Unit\][\s\S]*\[Service\][\s\S]*ExecStart=/i)
  assert.match(doc, /reverse_proxy|proxy_pass/i)
  assert.match(doc, /x402/i)
  assert.match(doc, /docker run/i)
})
