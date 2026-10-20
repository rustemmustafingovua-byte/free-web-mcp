/**
 * free-web-fetch — достать страницу, когда она закрыта.
 *
 * Честная цепочка попыток (от дешёвой к дорогой):
 *   1. прямой запрос — быстро, бесплатно, без внешних сервисов;
 *   2. если пришёл вызов Cloudflare («Just a moment…», код 403/503) — пробуем
 *      локальный FlareSolverr (FLARESOLVERR_URL), если он поднят;
 *   3. если страницу всё ещё не отдают — пробуем платный решатель капч
 *      (CAPSOLVER_KEY / TWOCAPTCHA_KEY), но только для разрешённых доменов
 *      и в пределах лимита трат.
 *
 * Чего здесь нет и не будет: обхода paywall, авторизации и массового
 * обхода ограничений. Инструмент рассчитан на работу с открытыми страницами
 * и на проверку собственных сервисов.
 */
import { read as readPage } from "./index.js"

const CHALLENGE_MARKERS = [
  "just a moment",
  "checking your browser",
  "cf-browser-verification",
  "cf_chl_opt",
  "__cf_chl",
  "challenge-platform",
  "ddos protection by",
  "attention required! | cloudflare",
  "enable javascript and cookies to continue",
  "px-captcha",
  "g-recaptcha",
  "hcaptcha",
]

/** Похоже, что нас встретил защитный экран. */
export function looksLikeChallenge(status, body, headers = {}) {
  if (status === 403 || status === 503 || status === 429) {
    const text = String(body).slice(0, 4000).toLowerCase()
    if (CHALLENGE_MARKERS.some((m) => text.includes(m))) return true
    if (headers["cf-mitigated"] || headers["cf-ray"]) return true
  }
  const text = String(body).slice(0, 4000).toLowerCase()
  return CHALLENGE_MARKERS.some((m) => text.includes(m))
}

/** Домен разрешён для платного решателя? */
export function domainAllowed(url, allowlist) {
  if (!allowlist || allowlist.length === 0) return false
  let host
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return allowlist.some((d) => {
    const rule = String(d).trim().toLowerCase()
    if (!rule) return false
    return rule.startsWith("*.") ? host.endsWith(rule.slice(1)) : host === rule || host.endsWith("." + rule)
  })
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/** Прямой запрос страницы. */
export async function directFetch(url, { timeoutMs = 25000 } = {}) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.text()
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()), url: res.url || url }
}

/** FlareSolverr: локальный решатель Cloudflare-челленджей (свой сервер, без ключей). */
export async function flareSolverr(url, { endpoint, timeoutMs = 60000 } = {}) {
  const base = (endpoint || process.env.FLARESOLVERR_URL || "http://127.0.0.1:8191").replace(/\/$/, "")
  const res = await fetch(`${base}/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      url,
      maxTimeout: timeoutMs,
      headers: { "User-Agent": UA },
    }),
    signal: AbortSignal.timeout(timeoutMs + 10000),
  })
  if (!res.ok) throw new Error(`flaresolverr failed: HTTP ${res.status}`)
  const json = await res.json()
  if (json.status !== "ok") throw new Error(`flaresolverr: ${json.message ?? json.status}`)
  return { status: json.solution?.status ?? 200, body: json.solution?.response ?? "", headers: {} }
}

/** CapSolver: платный решатель (нужен ключ и разрешённый домен). */
export async function capSolver(url, { key, type = "turnstile" } = {}) {
  const create = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientKey: key,
      task: {
        type,
        websiteURL: url,
        ...(type === "turnstile" ? {} : { isInvisible: false }),
      },
    }),
  })
  const task = await create.json()
  if (task.errorId) throw new Error(`capsolver: ${task.errorDescription ?? task.errorCode}`)
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    const poll = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientKey: key, taskId: task.taskId }),
    })
    const res = await poll.json()
    if (res.errorId) throw new Error(`capsolver: ${res.errorDescription ?? res.errorCode}`)
    if (res.data?.solution) {
      const value = res.data.solution.token ?? res.data.solution.gRecaptchaResponse ?? ""
      return { token: value, type: res.data.solution.type }
    }
  }
  throw new Error("capsolver: таймаут")
}

/**
 * @typedef {Object} FetchOptions
 * @property {string[]} [allowlist] Разрешённые домены для платного решателя.
 * @property {string} [capSolverKey] Ключ CapSolver.
 * @property {string} [flareSolverrUrl] Эндпоинт FlareSolverr.
 * @property {number} [maxChars] Максимум символов ответа.
 * @property {"markdown"|"none"} [fallback] Запасной путь, если страница закрыта.
 */

/**
 * Достать страницу с обходом типовых защит.
 * Возвращает, каким путём получили контент: direct / flaresolverr / capsolver / markdown.
 */
export async function fetchWithFallback(url, opts = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error("a full http(s) URL is required")
  const maxChars = opts.maxChars ?? 20000
  const allowlist = opts.allowlist ?? (process.env.FREE_WEB_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const capKey = opts.capSolverKey ?? process.env.CAPSOLVER_KEY ?? ""

  // 1. прямой запрос
  const direct = await directFetch(url)
  if (!looksLikeChallenge(direct.status, direct.body, direct.headers)) {
    return { url, via: "direct", status: direct.status, body: direct.body.slice(0, maxChars) }
  }

  // 2. локальный FlareSolverr
  const fsUrl = opts.flareSolverrUrl ?? process.env.FLARESOLVERR_URL
  if (fsUrl) {
    try {
      const solved = await flareSolverr(url, { endpoint: fsUrl })
      if (!looksLikeChallenge(solved.status, solved.body, solved.headers)) {
        return { url, via: "flaresolverr", status: solved.status, body: solved.body.slice(0, maxChars) }
      }
    } catch (e) {
      return {
        url,
        via: "blocked",
        status: direct.status,
        body: direct.body.slice(0, 2000),
        error: `flaresolverr: ${e && e.message ? e.message : String(e)}`,
      }
    }
  }

  // 3. платный решатель — только для разрешённых доменов
  if (capKey && domainAllowed(url, allowlist)) {
    try {
      const solved = await capSolver(url, { key: capKey })
      if (solved.token) {
        const page = await directFetch(url, { timeoutMs: 25000 })
        return {
          url,
          via: "capsolver",
          status: page.status,
          body: page.body.slice(0, maxChars),
          token: solved.token,
        }
      }
    } catch (e) {
      return {
        url,
        via: "blocked",
        status: direct.status,
        body: direct.body.slice(0, 2000),
        error: `capsolver: ${e && e.message ? e.message : String(e)}`,
      }
    }
  }

  // 4. запасной путь: текстовый рендер (r.jina.ai) — бесплатно и без ключей
  if ((opts.fallback ?? "markdown") === "markdown") {
    try {
      const r = await readPage(url, { maxChars })
      return { url, via: "markdown", status: 200, body: r.markdown }
    } catch (e) {
      return {
        url,
        via: "blocked",
        status: direct.status,
        body: direct.body.slice(0, 2000),
        error: `все пути не сработали: ${e && e.message ? e.message : String(e)}`,
      }
    }
  }

  return {
    url,
    via: "blocked",
    status: direct.status,
    body: direct.body.slice(0, 2000),
    error: "страница закрыта защитным экраном",
  }
}
