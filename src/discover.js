/**
 * free-web-mcp — инструменты обнаружения: карта сайта и структурированные данные.
 *
 * Агенту часто нужно не «прочитать страницу», а понять, что вообще есть на
 * сайте: какие страницы (sitemap) и что о них сказано (JSON-LD schema.org).
 * Оба инструмента бесплатны и не требуют ключей.
 */

/** Разобрать sitemap.xml (urlset или sitemapindex). */
export function parseSitemap(xml, { limit = 200 } = {}) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml)
  const urls = []
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    urls.push(m[1])
    if (urls.length >= limit) break
  }
  const lastmod = [...xml.matchAll(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi)].map((m) => m[1])
  return { kind: isIndex ? "index" : "urlset", count: urls.length, urls, lastmod: lastmod.slice(0, 5) }
}

/** Достать JSON-LD объекты со страницы. */
export function extractJsonLd(html, { limit = 20 } = {}) {
  const out = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) && out.length < limit) {
    const raw = m[1].trim()
    try {
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (!item || typeof item !== "object") continue
        out.push({
          type: item["@type"] ?? null,
          name: item.name ?? null,
          description: item.description ?? null,
          url: item.url ?? null,
          sku: item.sku ?? null,
          price: item.offers?.price ?? item.price ?? null,
          currency: item.offers?.priceCurrency ?? item.priceCurrency ?? null,
          rating: item.aggregateRating?.ratingValue ?? null,
        })
      }
    } catch {
      // битый JSON-LD — пропускаем, не роняем разбор
    }
  }
  return { count: out.length, items: out }
}

const UA = "free-web-mcp/0.6 (+https://github.com/rustemmustafingovua-byte/free-web-mcp)"

/** Карта сайта: по sitemap.xml или по /sitemap.xml, если адрес не указан. */
export async function sitemap(url, { limit = 200, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? fetch
  const candidates = url ? [url] : []
  if (!url) {
    throw new Error("укажите URL sitemap.xml")
  }
  const results = []
  for (const candidate of candidates) {
    const res = await doFetch(candidate, {
      headers: { "user-agent": UA, accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) continue
    const xml = await res.text()
    results.push({ url: candidate, ...parseSitemap(xml, { limit }) })
  }
  if (!results.length) throw new Error("sitemap не найден или недоступен")
  return results.length === 1 ? results[0] : { count: results.length, results }
}

/** Структурированные данные страницы (schema.org / JSON-LD). */
export async function structured(url, { limit = 20, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? fetch
  const res = await doFetch(url, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`structured failed: HTTP ${res.status}`)
  const html = await res.text()
  return { url, ...extractJsonLd(html, { limit }) }
}
