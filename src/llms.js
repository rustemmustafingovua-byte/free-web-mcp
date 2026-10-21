/**
 * free-web-mcp — работа с документацией сайта для агентов.
 *
 * llms.txt — стандарт, который сайты всё чаще отдают специально для ИИ:
 * список страниц с коротким описанием. Если его нет — берём sitemap и
 * выбираем страницы, похожие на документацию.
 */

/** Разобрать llms.txt: заголовки и ссылки с описаниями. */
export function parseLlmsTxt(text, { limit = 100 } = {}) {
  const items = []
  let section = null
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("#")) {
      section = line.replace(/^#+\s*/, "").trim()
      continue
    }
    const m = line.match(/^(?:[-*]\s*)?\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/)
    if (!m) continue
    items.push({
      title: m[1].trim(),
      url: m[2].trim(),
      description: (m[4] || "").trim(),
      section: section ?? null,
    })
    if (items.length >= limit) break
  }
  return { count: items.length, sections: [...new Set(items.map((i) => i.section).filter(Boolean))], items }
}

/** Найти llms.txt у домена: пробуем стандартные пути. */
export async function findLlms(baseUrl, { fetchImpl, paths = ["/llms.txt", "/.well-known/llms.txt", "/llms-full.txt"] } = {}) {
  const doFetch = fetchImpl ?? fetch
  let root
  try {
    root = new URL(baseUrl)
  } catch {
    throw new Error("a full http(s) URL is required")
  }
  for (const p of paths) {
    const url = new URL(p, root).toString()
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": "free-web-mcp/0.7", accept: "text/plain,*/*" },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      })
      if (!res.ok) continue
      const text = await res.text()
      if (!text.trim()) continue
      return { source: url, ...parseLlmsTxt(text) }
    } catch {
      // пробуем следующий путь
    }
  }
  return { source: null, count: 0, sections: [], items: [], hint: "llms.txt не найден — попробуйте sitemap через free-web-sitemap" }
}

/** Достать таблицы со страницы: заголовки и строки. */
export function extractTables(html, { maxTables = 10, maxRows = 50 } = {}) {
  const tables = []
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let m
  while ((m = tableRe.exec(html)) && tables.length < maxTables) {
    const block = m[0]
    const rows = []
    const rowRe = /<tr[\s\S]*?<\/tr>/gi
    let rm
    while ((rm = rowRe.exec(block)) && rows.length < maxRows) {
      const cells = []
      const cellRe = /<(t[hd])[^>]*>([\s\S]*?)<\/\1>/gi
      let cm
      while ((cm = cellRe.exec(rm[0]))) {
        const text = cm[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim()
        cells.push(text)
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) {
      const caption = block.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? null
      tables.push({ caption, headers: rows[0], rows: rows.slice(1), rowCount: rows.length - 1 })
    }
  }
  return { count: tables.length, tables }
}

/** Таблицы со страницы по URL. */
export async function tables(url, { maxTables = 10, maxRows = 50, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? fetch
  const res = await doFetch(url, {
    headers: { "user-agent": "free-web-mcp/0.7", accept: "text/html,*/*" },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`tables failed: HTTP ${res.status}`)
  const html = await res.text()
  return { url, ...extractTables(html, { maxTables, maxRows }) }
}
