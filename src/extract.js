/**
 * Дополнительные инструменты: извлечение данных со страницы и чтение RSS.
 *
 * free-web-mcp — веб без ключей и кредитов. Здесь то, что агентам нужно чаще
 * всего после «прочитай страницу»: ссылки с описаниями, метаданные и фиды.
 */

/** Достать из HTML заголовок, описание, og-метаданные и ссылки. */
export function extractFromHtml(html, { maxLinks = 30 } = {}) {
  const pick = (re) => {
    const m = html.match(re)
    return m ? decodeEntities(m[1].trim()) : null
  }
  const title =
    pick(/<title[^>]*>([\s\S]*?)<\/title>/i) ??
    pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    null
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ??
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ??
    null
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i)
  const canonical =
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ??
    pick(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i)

  const links = []
  const seen = new Set()
  const linkRe = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = linkRe.exec(html)) && links.length < maxLinks) {
    const href = m[1].trim()
    const text = decodeEntities(
      m[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    if (!href || !text || text.length < 3) continue
    const abs = toAbsolute(href)
    if (seen.has(abs)) continue
    seen.add(abs)
    links.push({ url: abs, text: text.slice(0, 160) })
  }

  return {
    title,
    description,
    ogImage,
    siteName,
    canonical,
    links,
    linksFound: links.length,
  }
}

/** Собрать абсолютный URL относительно базы. */
export function toAbsolute(href, base) {
  try {
    return base ? new URL(href, base).toString() : href
  } catch {
    return href
  }
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

/** Разобрать RSS/Atom в единый список. */
export function parseFeed(xml, { limit = 20 } = {}) {
  const items = []
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []
  for (const block of blocks) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))
      return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()) : null
    }
    const link =
      tag("link") ??
      (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? null)
    const published = tag("pubDate") ?? tag("published") ?? tag("updated")
    const title = tag("title")
    if (!title) continue
    items.push({
      title,
      link: link ? decodeEntities(link) : null,
      published,
      summary: (tag("description") ?? tag("summary") ?? tag("content") ?? "").slice(0, 400),
    })
    if (items.length >= limit) break
  }
  const feedTitle =
    xml.match(/<channel[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    xml.match(/<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null
  return {
    title: feedTitle ? decodeEntities(feedTitle.trim()) : null,
    items,
    count: items.length,
  }
}

/** Скачать страницу и разобрать её: заголовок, описание, ссылки. */
export async function extract(url, { maxLinks = 30, fetchImpl } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error("a full http(s) URL is required")
  const doFetch = fetchImpl ?? fetch
  const res = await doFetch(url, {
    headers: { "user-agent": "free-web-mcp/0.3 (+https://github.com/rustemmustafingovua-byte/free-web-mcp)" },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`extract failed: HTTP ${res.status}`)
  const html = await res.text()
  const data = extractFromHtml(html, { maxLinks })
  return { url, finalUrl: res.url || url, ...data, links: data.links.map((l) => ({ ...l, url: toAbsolute(l.url, res.url || url) })) }
}

/** Прочитать RSS/Atom ленту. */
export async function feed(url, { limit = 20, fetchImpl } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error("a full http(s) URL is required")
  const doFetch = fetchImpl ?? fetch
  const res = await doFetch(url, {
    headers: { "user-agent": "free-web-mcp/0.3 (+https://github.com/rustemmustafingovua-byte/free-web-mcp)" },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`feed failed: HTTP ${res.status}`)
  const xml = await res.text()
  return { url, ...parseFeed(xml, { limit }) }
}
