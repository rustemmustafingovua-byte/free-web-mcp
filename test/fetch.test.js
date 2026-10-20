import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { looksLikeChallenge, domainAllowed, fetchWithFallback, directFetch } from "../src/fetch.js"

/** Локальный сервер с двумя страницами: обычной и защищённой. */
const server = createServer((req, res) => {
  if (req.url === "/blocked") {
    res.writeHead(403, { "content-type": "text/html" })
    res.end(CF_PAGE)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(NORMAL_PAGE)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const CF_PAGE = `<!doctype html><html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification">Checking your browser before accessing</div>
<script>window._cf_chl_opt={}</script></body></html>`

const NORMAL_PAGE = `<!doctype html><html><head><title>Обычная страница</title></head><body>Привет</body></html>`

test("защитный экран Cloudflare распознаётся", () => {
  assert.equal(looksLikeChallenge(403, CF_PAGE, {}), true)
  assert.equal(looksLikeChallenge(503, CF_PAGE, {}), true)
  assert.equal(looksLikeChallenge(200, CF_PAGE, {}), true, "маркеры видны и в теле")
})

test("обычная страница не считается защитным экраном", () => {
  assert.equal(looksLikeChallenge(200, NORMAL_PAGE, {}), false)
  assert.equal(looksLikeChallenge(404, NORMAL_PAGE, {}), false)
})

test("заголовки cf-mitigated тоже считаются признаком защиты", () => {
  assert.equal(looksLikeChallenge(403, "<html></html>", { "cf-mitigated": "challenge" }), true)
})

test("allowlist: точный домен и поддомены", () => {
  assert.equal(domainAllowed("https://example.com/x", ["example.com"]), true)
  assert.equal(domainAllowed("https://api.example.com/x", ["example.com"]), true)
  assert.equal(domainAllowed("https://sub.example.com/x", ["*.example.com"]), true)
  assert.equal(domainAllowed("https://evil.com/x", ["example.com"]), false)
  assert.equal(domainAllowed("https://notexample.com/x", ["example.com"]), false)
  assert.equal(domainAllowed("https://example.com/x", []), false, "пустой allowlist = ничего не разрешено")
})

test("прямой запрос отдаёт страницу и статус", async () => {
  const r = await directFetch(base + "/ok")
  assert.equal(r.status, 200)
  assert.ok(r.body.includes("Обычная страница"))
})

test("fetchWithFallback: обычная страница идёт напрямую", async () => {
  const r = await fetchWithFallback(base + "/ok")
  assert.equal(r.via, "direct")
  assert.equal(r.status, 200)
})

test("fetchWithFallback: закрытая страница помечается как blocked или уходит в markdown", async () => {
  const r = await fetchWithFallback(base + "/blocked", { fallback: "none" })
  assert.ok(["blocked", "flaresolverr"].includes(r.via))
  if (r.via === "blocked") assert.ok(r.error)
})

test("fetchWithFallback: без allowlist платный решатель не трогаем", async () => {
  // домен не в списке → платный путь не должен вызываться (иначе была бы трата денег)
  const r = await fetchWithFallback(base + "/blocked", {
    fallback: "none",
    capSolverKey: "fake-key-should-not-be-used",
    allowlist: ["other.example"],
  })
  assert.equal(r.via, "blocked")
  assert.ok(!String(r.error ?? "").includes("capsolver"), "платный решатель не вызывался")
})
