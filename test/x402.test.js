import { test } from "node:test"
import assert from "node:assert/strict"
import { decodePaymentHeader, verifyPayment, paymentRequired } from "../src/x402.js"

test("decodes a base64 payment header", () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0x2", value: "1000", validAfter: "1", validBefore: "99999999999", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const p = decodePaymentHeader(raw)
  assert.equal(p.authorization.to, "0x2")
  assert.equal(p.signature, "0xabc")
})

test("a missing header is rejected", async () => {
  const v = await verifyPayment(null, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /missing/)
})

test("an expired payment is rejected", async () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0x2", value: "1000", validAfter: "1", validBefore: "1", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const v = await verifyPayment(raw, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /expired/)
})

test("a payment to the wrong payee is rejected", async () => {
  const body = { x402Version: 2, payload: { payload: { signature: "0xabc", authorization: { from: "0x1", to: "0xdead", value: "1000", validAfter: "1", validBefore: "99999999999", nonce: "0x00" } } } }
  const raw = Buffer.from(JSON.stringify(body)).toString("base64")
  const v = await verifyPayment(raw, { priceUsd: 0.001 })
  assert.equal(v.ok, false)
  assert.match(v.reason, /expected/)
})

test("the 402 carries the payment terms", () => {
  const r = paymentRequired(0.001)
  assert.equal(r.status, 402)
  const decoded = JSON.parse(Buffer.from(r.headers["payment-required"], "base64").toString())
  assert.equal(decoded.accepts[0].amount, "1000")
  assert.equal(decoded.accepts[0].network, "eip155:8453")
})


test("free-тир: лимит запросов в час с одного IP и 402 после него", async () => {
  const { createServer } = await import("node:http")
  // поднимаем такой же сервер, как в проде, но с лимитом 2
  const { spawn } = await import("node:child_process")
  const port = 8931
  const proc = spawn(
    "node",
    ["bin/free-web-mcp.js", "serve", "--port", String(port)],
    { env: { ...process.env, FREE_TIER_PER_HOUR: "2", X402_PRICE_USD: "0.001" }, stdio: "ignore" },
  )
  // ждём, пока сервер поднимется
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200))
    try {
      const h = await fetch(`http://127.0.0.1:${port}/health`)
      if (h.ok) break
    } catch {}
  }
  try {
    const call = async (path, headers = {}) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
      return res
    }
    const a = await call("/mcp")
    const b = await call("/mcp")
    const c = await call("/mcp")
    assert.equal(a.status, 200, "первый запрос — бесплатно")
    assert.equal(b.status, 200, "второй запрос — бесплатно")
    assert.equal(c.status, 402, "третий запрос — уже платный")
    const paid = await call("/mcp/paid")
    assert.equal(paid.status, 402, "платный путь всегда требует оплаты")
  } finally {
    proc.kill()
  }
})
