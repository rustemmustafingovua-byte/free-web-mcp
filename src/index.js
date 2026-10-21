/**
 * free-web-mcp — web search and page reading with **zero API credits**.
 *
 * Sources (no key required):
 *   r.jina.ai/<url>     any page -> clean markdown
 *   ru|en.wikipedia.org  articles and summaries
 *   hn.algolia.com      Hacker News search
 *   api.github.com      repo / code / issue search (optional GITHUB_TOKEN)
 *
 * Optional paid search: s.jina.ai (Jina Search) if a free Jina key is present.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

export const SOURCES = {
  read: "r.jina.ai",
  wiki: "wikipedia.org",
  hn: "hn.algolia.com",
  github: "api.github.com",
  jina: "s.jina.ai (optional, needs a free key)",
}

async function text(url, { headers = {}, timeout = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...headers },
    signal: AbortSignal.timeout(timeout),
  })
  return { status: res.status, body: await res.text() }
}

async function json(url, opts = {}) {
  const r = await text(url, opts)
  try {
    return { status: r.status, json: JSON.parse(r.body) }
  } catch {
    return { status: r.status, json: null, body: r.body }
  }
}

/** Read any page as markdown. */
export async function read(url, { maxChars = 12000 } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error("a full http(s) URL is required")
  const r = await text(`https://r.jina.ai/${url}`, { timeout: 45000 })
  if (r.status >= 400) throw new Error(`read failed: HTTP ${r.status}`)
  return { url, markdown: r.body.slice(0, maxChars) }
}

/** Search Wikipedia (ru by default). */
export async function wiki(query, { lang = "ru" } = {}) {
  const r = await json(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`,
  )
  if (r.status < 400 && r.json?.extract) {
    return { title: r.json.title, extract: r.json.extract, url: r.json.content_urls?.desktop?.page }
  }
  const s = await json(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`,
  )
  const hits = s.json?.query?.search || []
  return { matches: hits.map((h) => h.title) }
}

/** Search Hacker News. */
export async function hn(query, { limit = 5 } = {}) {
  const r = await json(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`,
  )
  const hits = r.json?.hits || []
  return hits.map((h) => ({
    title: h.title,
    points: h.points,
    author: h.author,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
  }))
}

/** Search GitHub repositories / code / issues. */
export async function github(query, { kind = "repositories", limit = 5, token } = {}) {
  const headers = { Accept: "application/vnd.github+json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const path = kind === "code" ? "code" : kind === "issues" ? "issues" : "repositories"
  const r = await json(
    `https://api.github.com/search/${path}?q=${encodeURIComponent(query)}&per_page=${limit}`,
    { headers },
  )
  const items = r.json?.items || []
  return {
    total: r.json?.total_count ?? items.length,
    items: items.map((x) => ({
      name: x.full_name ?? x.repository?.full_name ?? x.title,
      url: x.html_url ?? x.url,
      stars: x.stargazers_count,
      description: x.description,
    })),
  }
}

/**
 * Search everything at once.
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.source] all | web | wiki | hn | github
 * @param {number} [opts.limit]
 * @param {string} [opts.jinaKey]
 * @param {string} [opts.githubToken]
 */
export async function search(query, opts = {}) {
  const source = opts.source || "all"
  const limit = opts.limit ?? 5
  const out = {}

  if ((source === "all" || source === "web") && opts.jinaKey) {
    const r = await json(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${opts.jinaKey}` },
      timeout: 45000,
    })
    out.web = (r.json?.data || []).slice(0, limit).map((x) => ({
      title: x.title,
      url: x.url,
      description: x.description,
    }))
  }
  if (source === "all" || source === "wiki") out.wiki = await wiki(query)
  if (source === "all" || source === "hn") out.hn = await hn(query, { limit })
  if (source === "all" || source === "github")
    out.github = await github(query, { limit, token: opts.githubToken })
  return out
}

export const version = "0.7.0"

export { verifyPayment, paymentRequired, decodePaymentHeader, PAY_TO, USDC_BASE } from "./x402.js"
export { extract, feed, extractFromHtml, parseFeed, toAbsolute, decodeEntities } from "./extract.js"
export { sitemap, structured, parseSitemap, extractJsonLd } from "./discover.js"
export { findLlms, parseLlmsTxt, extractTables, tables } from "./llms.js"
export {
  fetchWithFallback,
  looksLikeChallenge,
  domainAllowed,
  directFetch,
  flareSolverr,
  capSolver,
} from "./fetch.js"
